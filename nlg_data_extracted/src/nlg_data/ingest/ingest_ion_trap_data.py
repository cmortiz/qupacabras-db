import asyncio
from datetime import datetime
import json
from pathlib import Path
from dataclasses import dataclass
import re

import numpy as np
import pandas as pd
from tinydb import TinyDB

from .. import util
from ..models import (
    CircuitData,
    CircuitResult,
    Device,
    Experiment,
    NonlocalGame,
    Result,
    Winrate,
)
from .adapter import Adapter

collab_folder = Path("raw_data/duke_collab")
circuits = collab_folder / "circuits"


@dataclass
class CircuitMapping:
    map: dict[int, tuple[int, int]]

    @property
    def vertex_indices(self):
        return set(k for k, v in self.map.items() if v[0] == v[1])

    @property
    def edge_indices(self):
        return set(self.map) - self.vertex_indices


def get_circuit_mapping(data_folder: Path):
    pattern = re.compile(r"line (\d+) \((\d+), (\d+)\)")
    circuit_dir = data_folder / circuits
    mapping = {}
    for file in circuit_dir.glob("*.txt"):
        if m := pattern.match(file.stem):
            n, va, vb = map(int, m.groups())
            mapping[n] = (va, vb)

    return CircuitMapping(mapping)


def get_blue_data(game: NonlocalGame, data_folder: Path, mapping: CircuitMapping):
    shots = 2000
    file = data_folder / collab_folder / "Blue data.txt"
    data: list[dict[int, float]] = eval(file.read_text())
    count_results = Result()
    winrates = {}
    for idx, probs in enumerate(data):
        w = sum(probs.get(x, 0) for x in {0, 5, 10, 15})

        if idx in mapping.edge_indices:
            w = 1 - w

        winrates[idx] = w

        counts = {}
        for x_int, p in probs.items():
            n = int(np.round(shots * p))
            ca, cb = x_int % 4, x_int // 4
            counts[(ca, cb)] = n

        count_results.results.append(
            CircuitResult(
                circuit=list(mapping.map[idx]),
                win_rate=w,
                counts=counts,
            )
        )

    experiment = Experiment(
        game_id=game.id,
        date=datetime(2024, 10, 9),  # fixme: need time for executions
        device=Device(type="trapped-ion", provider="duke", name="blue"),
        win_rate=Winrate.from_circuit_winrates(game, list(winrates.values()), shots),
        circuit_data=CircuitData(
            strategy="bell_pair",
            shots=shots,
            num_circuits=len(winrates),
            qasm_path=circuits,
            result_path=collab_folder / "Blue data.txt",
        ),
        publication=None,
        attributes={
            "vertex_win_rate": np.mean([winrates[x] for x in mapping.vertex_indices]),
            "edge_win_rate": np.mean([winrates[x] for x in mapping.edge_indices]),
        },
    )

    return experiment, count_results


def get_ionq_data(game: NonlocalGame, data_folder: Path, mapping: CircuitMapping):
    shots = 20000
    file = data_folder / collab_folder / "ionq_winrates.json"
    data = json.loads(file.read_text())
    winrates = {int(k): v for k, v in data.items()}

    experiment = Experiment(
        game_id=game.id,
        date=datetime(2024, 11, 4),  # fixme: need time for executions
        device=Device(type="trapped-ion", provider="ionq", name="aria"),
        win_rate=Winrate.from_circuit_winrates(game, list(winrates.values()), shots),
        circuit_data=CircuitData(
            strategy="bell_pair",
            shots=shots,
            num_circuits=len(winrates),
            qasm_path=circuits,
            result_path=collab_folder / "ionq_winrates.json",
        ),
        publication=None,
        attributes={
            "vertex_win_rate": np.mean([winrates[x] for x in mapping.vertex_indices]),
            "edge_win_rate": np.mean([winrates[x] for x in mapping.edge_indices]),
        },
    )

    return experiment, None  # todo: don't have histogram data for IonQ


def get_gold_data(game: NonlocalGame, data_folder: Path, mapping: CircuitMapping):
    shots = 2000
    file = data_folder / collab_folder / "Gold data.json"
    data: dict[str, dict[str, float]] = json.loads(file.read_text())
    winrates = {}
    count_results = Result(results=[])
    for idx_str, probs in data.items():
        idx = int(idx_str)

        counts = {}
        for bitstring, p in probs.items():
            n = int(np.round(p * shots))
            ca, cb = int(bitstring[-2:], 2), int(bitstring[:2], 2)
            counts[(ca, cb)] = n

        probs = {int(k, 2): v for k, v in probs.items()}
        w = sum(probs.get(x, 0) for x in {0, 5, 10, 15})

        if idx in mapping.edge_indices:
            w = 1 - w

        winrates[idx] = w

        count_results.results.append(
            CircuitResult(
                circuit=list(mapping.map[idx]),
                win_rate=w,
                counts=counts,
            )
        )

    experiment = Experiment(
        game_id=game.id,
        date=datetime(2024, 11, 18),  # fixme: need time for executions
        device=Device(type="trapped-ion", provider="duke", name="gold"),
        win_rate=Winrate.from_circuit_winrates(game, list(winrates.values()), shots),
        circuit_data=CircuitData(
            strategy="bell_pair",
            shots=shots,
            num_circuits=len(winrates),
            qasm_path=circuits,
            result_path=collab_folder / "Gold data.json",
        ),
        publication=None,
        attributes={
            "vertex_win_rate": np.mean([winrates[x] for x in mapping.vertex_indices]),
            "edge_win_rate": np.mean([winrates[x] for x in mapping.edge_indices]),
        },
    )

    return experiment, count_results


def get_silver_data(game: NonlocalGame, data_folder: Path, mapping: CircuitMapping):
    file = data_folder / collab_folder / "silver_unmitigated.csv"

    # Has structure va,vb,shots,win_rate
    df = pd.read_csv(file)
    shots = df["shots"].iloc[0]
    df["question"] = np.where(df["va"] == df["vb"], "vertex", "edge")
    winrates_overview = df.groupby("question").win_rate.mean()
    winrate = Winrate.from_circuit_winrates(game, df["win_rate"].values, shots)

    experiment = Experiment(
        game_id=game.id,
        date=datetime(2024, 7, 18),
        device=Device(type="trapped-ion", provider="duke", name="silver"),
        win_rate=winrate,
        circuit_data=CircuitData(
            strategy="bell_pair",
            shots=shots,
            num_circuits=len(df),
            qasm_path=circuits,
            result_path=collab_folder / "silver_unmitigated.csv",
        ),
        publication=None,
        attributes={f"{k}_win_rate": v for k, v in winrates_overview.items()},
    )

    return experiment, None  # todo: find the raw files that anton put the counts in


class Duke2024Adapter(Adapter):
    async def ingest(self) -> list[tuple[Experiment, Result]]:
        mapping = get_circuit_mapping(self.data_folder)
        loop = asyncio.get_running_loop()
        futures = [
            loop.run_in_executor(None, func, self.game, self.data_folder, mapping)
            for func in (get_silver_data, get_gold_data, get_blue_data, get_ionq_data)
        ]

        results = await asyncio.gather(*futures)
        return results


def ingest_ion_trap_data(db: TinyDB, table: TinyDB, data_folder: Path):
    g14 = util.get_game_by_name(db, "G14")
    mapping = get_circuit_mapping(data_folder)
    table.insert(get_silver_data(g14, data_folder, mapping).model_dump(mode="json"))
    table.insert(get_blue_data(g14, data_folder, mapping).model_dump(mode="json"))
    table.insert(get_gold_data(g14, data_folder, mapping).model_dump(mode="json"))
    table.insert(get_ionq_data(g14, data_folder, mapping).model_dump(mode="json"))
