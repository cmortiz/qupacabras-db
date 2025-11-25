import asyncio
import shutil
from datetime import datetime
from pathlib import Path
import itertools

import numpy as np
import pandas as pd
import pytz
from qiskit_ibm_runtime import QiskitRuntimeService
from tinydb import TinyDB

from .. import papers, util
from ..models import (
    CircuitData,
    CircuitResult,
    Device,
    Experiment,
    Object,
    Result,
    Winrate,
)
from .adapter import Adapter
from .new_ibm_data.experiments import get_experiments
from .new_ibm_data.game_result import GameResult


class IbmSherbrookeAdapter(Adapter):
    async def ingest(self):
        service = QiskitRuntimeService()
        data_dir = self.data_folder / "raw_data" / "ibm_2024"
        experiments = get_experiments(data_dir, service, real_only=True)

        # Filter to only keep complete and downloaded ones. Also remove all runs that had invalid circuits
        mask = (experiments.status == "DONE") & experiments.downloaded
        submitted_times = pd.to_datetime(experiments["submitted"])
        mask &= submitted_times >= pd.Timestamp(datetime(2024, 9, 27))
        experiments = experiments.loc[mask]

        loop = asyncio.get_running_loop()
        futures = []
        for _, experiment in experiments.iterrows():
            future = loop.run_in_executor(
                None, self._load_experiment_blocking, experiment, data_dir
            )
            futures.append(future)

        results: list[list[tuple[Experiment, Result]]] = await asyncio.gather(*futures)
        return list(itertools.chain.from_iterable(results))

    def _load_experiment_blocking(
        self, experiment: pd.Series, data_dir: Path
    ) -> list[tuple[Experiment, Result]]:
        service = QiskitRuntimeService()
        zipfile = data_dir / experiment["id"] / "raw.zip"
        tmpdir = data_dir / experiment["id"] / "raw"
        shutil.unpack_archive(zipfile, tmpdir)
        return_results: list[tuple[Experiment, Result]] = []

        for job_folder in tmpdir.iterdir():
            result = GameResult.load_from_folder(job_folder)
            record = result.to_record()
            attributes = {
                k: record[k] for k in {"job_id", "vertex_win_rate", "edge_win_rate"}
            }

            winrate_A = result.get_adjacency_matrix()
            winrates = winrate_A.flat
            winrates = winrates[~np.isnan(winrates)]
            unique_shots = set(map(_counts_to_shots, result.counts.values()))

            if len(unique_shots) != 1:
                raise ValueError(
                    f"Obtained multiple distinct shot counts for experiment {experiment['id']}:",
                    unique_shots,
                )

            shots = unique_shots.pop()
            data = Experiment(
                game_id=self.game.id,
                date=service.job(result.job_id).creation_date,
                device=Device(
                    type="superconducting",
                    provider="ibm",
                    name=experiment.backend.split("_", 1)[-1],
                ),
                win_rate=Winrate.from_circuit_winrates(self.game, winrates, shots),
                circuit_data=CircuitData(
                    strategy=record["strategy"],
                    shots=shots,
                    num_circuits=len(winrates),
                    qasm_path=f"games/g14/circuits/{record['strategy']}",
                    result_path=f"raw_data/ibm_2024/{experiment["id"]}/raw.zip",
                ),
                publication=papers.g14paper,
                attributes=attributes,
                objects=[
                    Object(
                        name="raw data",
                        description="Full data including memory, counts, and noise characterization",
                        path=f"raw_data/ibm_2024/{experiment["id"]}/raw.zip",
                    )
                ],
            )

            circuit_result = Result(results=[])
            for x, hist in result.counts.items():
                new_hist = {}
                for bitstring, n in hist.items():
                    a = int(bitstring[-2:], 2)
                    b = int(bitstring[:2], 2)
                    new_hist[(a, b)] = n

                circuit_result.results.append(
                    CircuitResult(
                        circuit=list(x),
                        win_rate=winrate_A[x],
                        counts=new_hist,
                    )
                )

            return_results.append((data, circuit_result))

        # Cleanup the extracted data
        shutil.rmtree(tmpdir)
        return return_results


def ingest_new_ibm_data(db: TinyDB, table: TinyDB, data_folder: Path):
    service = QiskitRuntimeService()
    g14 = util.get_game_by_name(db, "G14")
    data_dir = data_folder / "raw_data" / "ibm_2024"
    experiments = get_experiments(data_dir, service, real_only=True)

    # Filter to only keep complete and downloaded ones
    mask = (experiments.status == "DONE") & experiments.downloaded
    experiments = experiments.loc[mask]

    for _, experiment in experiments.iterrows():
        zipfile = data_dir / experiment["id"] / "raw.zip"
        tmpdir = data_dir / experiment["id"] / "raw"
        shutil.unpack_archive(zipfile, tmpdir)

        for job_folder in tmpdir.iterdir():
            result = GameResult.load_from_folder(job_folder)
            record = result.to_record()
            attributes = {
                k: record[k] for k in {"job_id", "vertex_win_rate", "edge_win_rate"}
            }

            winrates = result.get_adjacency_matrix().flat
            winrates = winrates[~np.isnan(winrates)]
            unique_shots = set(map(_counts_to_shots, result.counts.values()))

            if len(unique_shots) != 1:
                raise ValueError(
                    f"Obtained multiple distinct shot counts for experiment {experiment['id']}:",
                    unique_shots,
                )

            shots = unique_shots.pop()
            data = Experiment(
                game_id=g14.id,
                date=service.job(result.job_id).creation_date,
                device=Device(
                    type="superconducting", provider="ibm", name=experiment.backend
                ),
                win_rate=Winrate.from_circuit_winrates(g14, winrates, shots),
                circuit_data=CircuitData(
                    strategy=record["strategy"],
                    shots=shots,
                    num_circuits=len(winrates),
                    qasm_path=f"data/games/g14/circuits/{record['strategy']}",
                    result_path=f"data/raw_data/ibm_2024/{experiment["id"]}/raw.zip",
                ),
                publication=papers.g14paper,
                attributes=attributes,
                objects=[
                    Object(
                        name="raw data",
                        description="Full data including memory, counts, and noise characterization",
                        path=f"data/raw_data/ibm_2024/{experiment["id"]}/raw.zip",
                    )
                ],
            )

            table.insert(data.model_dump(mode="json"))

        # Cleanup the extracted data
        shutil.rmtree(tmpdir)


def _counts_to_shots(counts: dict[str, int]):
    return sum(counts.values())
