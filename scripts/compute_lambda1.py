#!/usr/bin/env python3

"""Compute spectral gap (lambda1) per submission folder.

Writes public/lambda1-index.json as:
{
  "<folder>": {"lambda1": 1.234567, "lambda1Source": "explicit" | "qasm"}
}

Soft-failure behavior: any per-folder errors emit null values, and the script
always exits 0.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Iterable

try:
    import networkx as nx
except Exception as exc:  # pragma: no cover
    print(f"[lambda1] networkx unavailable: {exc}")
    sys.exit(0)


ROOT = Path(__file__).resolve().parent.parent
SUBMISSIONS_DIR = ROOT / "submissions"
OUTPUT_FILE = ROOT / "public" / "lambda1-index.json"
QUBIT_REGEX = re.compile(r"q\[(\d+)\]")


def _safe_load_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _iter_qasm_paths(folder: Path, benchmark: dict) -> list[Path]:
    files = []
    qasm_files = benchmark.get("qasmFiles")
    if isinstance(qasm_files, list) and qasm_files:
        for name in qasm_files:
            if isinstance(name, str):
                candidate = folder / name
                if candidate.exists() and candidate.is_file():
                    files.append(candidate)
    else:
        files.extend(sorted(p for p in folder.glob("*.qasm") if p.is_file()))
    return files


def _edges_from_qasm_files(qasm_paths: Iterable[Path]) -> tuple[set[int], set[tuple[int, int]]]:
    nodes: set[int] = set()
    edges: set[tuple[int, int]] = set()

    for qasm_path in qasm_paths:
        try:
            lines = qasm_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except Exception:
            continue

        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("//"):
                continue

            # Skip declarations/directives: these reference qubit registers or
            # individual qubits but are not gates. In particular `qreg q[N]`
            # would otherwise inject a phantom, isolated node N (disconnecting
            # the graph and forcing lambda1 to 0), and `barrier q[a],q[b]` would
            # add spurious edges. Mirrors scripts/analyze-qasm.js.
            if re.match(r"(openqasm|include|qreg|creg|measure|barrier|gate|opaque)\b",
                        stripped, re.IGNORECASE):
                continue

            qubits = [int(m) for m in QUBIT_REGEX.findall(stripped)]
            if not qubits:
                continue

            nodes.update(qubits)

            if len(qubits) == 2 and qubits[0] != qubits[1]:
                u, v = sorted(qubits)
                edges.add((u, v))

    return nodes, edges


def _graph_from_explicit(benchmark: dict) -> nx.Graph | None:
    graph_data = benchmark.get("graph")
    if not isinstance(graph_data, dict):
        return None

    edge_list = graph_data.get("edges")
    if not isinstance(edge_list, list):
        return None

    graph = nx.Graph()
    for edge in edge_list:
        if not isinstance(edge, (list, tuple)) or len(edge) != 2:
            continue
        u, v = edge[0], edge[1]
        if not isinstance(u, int) or not isinstance(v, int) or u == v:
            continue
        graph.add_edge(u, v)

    return graph


def _graph_from_qasm(folder: Path, benchmark: dict) -> nx.Graph | None:
    qasm_paths = _iter_qasm_paths(folder, benchmark)
    if not qasm_paths:
        return None

    nodes, edges = _edges_from_qasm_files(qasm_paths)
    if not nodes and not edges:
        return None

    graph = nx.Graph()
    graph.add_nodes_from(nodes)
    graph.add_edges_from(edges)
    return graph


def _compute_lambda1(graph: nx.Graph) -> float | None:
    if graph.number_of_nodes() < 2:
        return None
    spectrum = nx.normalized_laplacian_spectrum(graph)
    if len(spectrum) < 2:
        return None
    return round(float(spectrum[1]), 6)


def compute_index() -> dict:
    index: dict[str, dict[str, float | str | None]] = {}

    if not SUBMISSIONS_DIR.exists():
        print(f"[lambda1] submissions dir not found: {SUBMISSIONS_DIR}")
        return index

    for folder in sorted(SUBMISSIONS_DIR.iterdir()):
        if not folder.is_dir() or folder.name == "template":
            continue

        result = {"lambda1": None, "lambda1Source": None}
        index[folder.name] = result

        try:
            benchmark_path = folder / "benchmark.json"
            benchmark = _safe_load_json(benchmark_path)
            if not benchmark:
                continue

            graph = _graph_from_explicit(benchmark)
            source = "explicit" if graph is not None else None

            if graph is None:
                graph = _graph_from_qasm(folder, benchmark)
                if graph is not None:
                    source = "qasm"

            if graph is None:
                continue

            lambda1 = _compute_lambda1(graph)
            if lambda1 is None:
                continue

            result["lambda1"] = lambda1
            result["lambda1Source"] = source
        except Exception as exc:
            print(f"[lambda1] warning: failed for {folder.name}: {exc}")
            continue

    return index


def main() -> int:
    try:
        index = compute_index()
        OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_FILE.write_text(json.dumps(index, indent=2), encoding="utf-8")
        print(f"[lambda1] wrote {OUTPUT_FILE} ({len(index)} entries)")
    except Exception as exc:
        print(f"[lambda1] warning: failed to write index: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
