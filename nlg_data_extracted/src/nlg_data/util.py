from pathlib import Path
from uuid import UUID
from tinydb import Query, TinyDB

from .models import NonlocalGame


def get_experiment_data_dir(uuid: UUID, data_folder: Path):
    return data_folder / str(uuid)


def get_game_by_name(db: TinyDB, name: str) -> NonlocalGame:
    table = db.table("games")
    Game = Query()
    results = table.search(Game.name == name)

    if len(results) != 1:
        raise ValueError("Did not find unique game as expected")

    return NonlocalGame.model_validate(results[0])
