from abc import ABC, abstractmethod
from pathlib import Path

from ..models import Experiment, NonlocalGame, Result


class Adapter(ABC):
    """Interface for a data adapter that imports data into the database"""

    def __init__(self, game: NonlocalGame, data_folder: Path):
        self.data_folder = data_folder
        self.game = game

    @abstractmethod
    async def ingest(self) -> list[tuple[Experiment, Result]]:
        """Ingests the data, storing it internally"""
