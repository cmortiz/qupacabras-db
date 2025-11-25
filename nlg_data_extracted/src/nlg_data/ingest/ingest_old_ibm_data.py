from pathlib import Path
import pandas as pd
from tinydb import TinyDB
from datetime import datetime

from .adapter import Adapter

from .. import util, papers
from ..models import CircuitData, Device, Experiment, Winrate, CircuitResult, Result


class Ibm2023Adapter(Adapter):
    async def ingest(self) -> list[tuple[Experiment, Result]]:
        final_results = []
        processed_csv = self.data_folder / "raw_data" / "ibm_2023" / "ibm_processed.csv"
        raw_csv = self.data_folder / "raw_data" / "ibm_2023" / "ibm_results.csv"

        df = pd.read_csv(processed_csv)
        raw_df = pd.read_csv(raw_csv)

        for job_id, gdf in df.groupby("job"):
            first_row = gdf.iloc[0]
            shots = first_row.shots
            device = Device(
                type="superconducting",
                provider="ibm",
                name=first_row.backend.split("_", 1)[-1],
            )
            date = datetime.fromisoformat(first_row.time)

            winrate = Winrate.from_circuit_winrates(self.game, gdf.q_winrate, shots)
            winrates_by_type = gdf.groupby("qtype").q_winrate.mean()

            # Obtain the counts from the raw csv that has the columns ca, cb, n
            count_results = Result(results=[])
            for _, row in gdf.iterrows():
                va, vb = row["va"], row["vb"]
                raw_gdf = raw_df.loc[(raw_df["va"] == va) & (raw_df["vb"] == vb)]
                counts = {}
                for ca, cb, n in zip(raw_gdf["ca"], raw_gdf["cb"], raw_gdf["n"]):
                    counts[(ca, cb)] = n

                count_results.results.append(
                    CircuitResult(
                        circuit=[va, vb],
                        win_rate=row["q_winrate"],
                        counts=counts,
                    )
                )

            circuit_data = CircuitData(
                strategy="4q",
                shots=shots,
                num_circuits=len(gdf),
                qasm_path="games/g14/circuits/4q",
                result_path="raw_data/ibm_2023/ibm_results.csv",
            )
            experiment = Experiment(
                game_id=self.game.id,
                date=date,
                device=device,
                win_rate=winrate,
                circuit_data=circuit_data,
                publication=papers.g14paper,
                attributes={
                    "job_id": job_id,
                    "vertex_win_rate": winrates_by_type["Vertex"],
                    "edge_win_rate": winrates_by_type["Edge"],
                },
            )

            final_results.append((experiment, count_results))

        return final_results


def ingest_old_ibm_data(db: TinyDB, table: TinyDB, data_folder: Path):
    g14 = util.get_game_by_name(db, "G14")
    df = pd.read_csv(data_folder / "raw_data" / "ibm_2023" / "ibm_processed.csv")
    for job_id, gdf in df.groupby("job"):
        first_row = gdf.iloc[0]
        shots = first_row.shots
        device = Device(type="superconducting", provider="ibm", name=first_row.backend)
        date = datetime.fromisoformat(first_row.time)

        winrate = Winrate.from_circuit_winrates(g14, gdf.q_winrate, shots)
        winrates_by_type = gdf.groupby("qtype").q_winrate.mean()
        circuit_data = CircuitData(
            strategy="4q",
            shots=shots,
            num_circuits=len(gdf),
            qasm_path="games/g14/circuits/4q",
            result_path="raw_data/ibm_2023",
        )
        experiment = Experiment(
            game_id=g14.id,
            date=date,
            device=device,
            win_rate=winrate,
            circuit_data=circuit_data,
            publication=papers.g14paper,
            attributes={
                "job_id": job_id,
                "vertex_win_rate": winrates_by_type["Vertex"],
                "edge_win_rate": winrates_by_type["Edge"],
            },
        )
        table.insert(experiment.model_dump(mode="json"))
