import asyncio
from pathlib import Path

from tinydb import TinyDB
from tinydb.table import Document, Table

from . import papers, util
from .ingest.ingest_ion_trap_data import Duke2024Adapter
from .ingest.ingest_new_ibm_data import IbmSherbrookeAdapter
from .ingest.ingest_old_ibm_data import Ibm2023Adapter
from .ingest.ingest_rigetti_data import RigettiAdapter
from .models import *

data_folder = Path("data")
db_file = data_folder / "db.json"


def make_games(db: TinyDB):
    table = db.table("games")
    table.insert(
        NonlocalGame(
            name="G14",
            optimal_classical_value=86 / 88,
            optimal_quantum_value=1,
            publication=papers.odditiespaper,
            tags=["graph-coloring"],
            objects=[
                Object(
                    name="graph",
                    description="NetworkX definition of the G14 graph",
                    path="games/g14/g14.nx",
                )
            ],
        ).model_dump(mode="json")
    )


def add_experiment(
    table: Table,
    data_folder: Path,
    experiment: Experiment,
    count_result: Result | None,
):
    experiment.attributes["has_counts"] = count_result is not None
    doc_id = table.insert(experiment.model_dump(mode="json"))

    if count_result is not None:
        countsfile = data_folder / "experiments" / f"result_{doc_id}.json"
        countsfile.parent.mkdir(exist_ok=True, parents=True)
        countsfile.write_text(count_result.model_dump_json())

        # Update the document to have a path to this file
        new_data = experiment.circuit_data.model_dump(mode="json")
        new_data["result_path"] = countsfile.relative_to(data_folder).as_posix()
        table.update({"circuit_data": new_data}, doc_ids=[doc_id])


async def main():
    db = TinyDB("data/db.json", sort_keys=True, indent=4, separators=(",", ": "))
    make_games(db)

    g14 = util.get_game_by_name(db, "G14")
    experiment_table = db.table("experiments")
    data_folder = Path("data")
    adapters = [
        cls(g14, data_folder)
        for cls in (
            Ibm2023Adapter,
            RigettiAdapter,
            IbmSherbrookeAdapter,
            Duke2024Adapter,
        )
    ]

    futures = [adapter.ingest() for adapter in adapters]
    for future in asyncio.as_completed(futures):
        result = await future
        for experiment, count_results in result:
            add_experiment(experiment_table, data_folder, experiment, count_results)

    db.close()


def main_sync():
    asyncio.run(main())


if __name__ == "__main__":
    main_sync()
