import ast
import uuid
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any, Dict, Tuple

import numpy as np
import pandas as pd
from pydantic import (
    UUID4,
    AfterValidator,
    BaseModel,
    BeforeValidator,
    Field,
    HttpUrl,
    field_serializer,
)

from . import uncertainty


def validate_tuple_keys(v: Dict[str, Any]) -> Dict[Tuple[int, ...], Any]:
    """
    Validator function to convert string representations of tuples back to actual tuples.
    """
    if not isinstance(v, dict):
        # This handles cases where the input is not a dict (e.g., None, a string, etc.)
        # Pydantic's core validation will then handle if it's not the right overall type.
        return v  # or raise TypeError("Input must be a dictionary") if stricter validation is needed here

    new_dict = {}
    for key_str, value in v.items():
        try:
            # Safely evaluate the string as a Python literal (e.g., tuple, int, float, list, dict, string, bool, None)
            evaluated_key = ast.literal_eval(key_str)
            # Ensure the evaluated key is indeed a tuple and matches the expected type
            if not isinstance(evaluated_key, tuple):
                raise ValueError(f"Key '{key_str}' is not a valid tuple string.")
            # Optionally, you can add more specific validation for the tuple's contents
            # For example, to ensure all elements are integers:
            if not all(isinstance(item, int) for item in evaluated_key):
                raise ValueError(
                    f"Tuple key '{key_str}' contains non-integer elements."
                )

            new_dict[evaluated_key] = value
        except (ValueError, SyntaxError) as e:
            # If ast.literal_eval fails, it means the string is not a valid literal
            raise ValueError(
                f"Invalid tuple key string received: '{key_str}'. Error: {e}"
            ) from e
    return new_dict


TupleKeyIntDict = Annotated[
    Dict[Tuple[int, ...], Any], BeforeValidator(validate_tuple_keys)
]


class Object(BaseModel):
    name: str
    description: str
    path: Path | Annotated[str, AfterValidator(lambda x: Path(x))]

    @field_serializer("path")
    def serialize_path(self, path: Path, _info):
        return path.as_posix()


class Publication(BaseModel):
    citation: str
    url: HttpUrl


class Device(BaseModel):
    type: str
    provider: str
    name: str


class CircuitData(BaseModel):
    strategy: str
    shots: int
    num_circuits: int
    qasm_path: Path | Annotated[str, AfterValidator(lambda x: Path(x))]
    """Folder to QASM files for each circuit"""

    result_path: Path | Annotated[str, AfterValidator(lambda x: Path(x))]
    """Json file containing a list of CircuitResult objects"""

    @field_serializer("qasm_path", "result_path")
    def serialize_path(self, path: Path, _info):
        return path.as_posix()


class Result(BaseModel):
    results: list["CircuitResult"] = Field(default_factory=list)

    @property
    def df(self) -> pd.DataFrame:
        records = []
        for circuit_result in self.results:
            query = {f"x{i}": v for i, v in enumerate(circuit_result.circuit)}
            d = query | {"win_rate": circuit_result.win_rate}

            if circuit_result.counts is not None:
                for outcome, count in circuit_result.counts.items():
                    record = d.copy()
                    a = {f"a{i}": v for i, v in enumerate(outcome)}
                    record = record | a | {"count": count}
                    records.append(record)
            else:
                records.append(d)

        return pd.DataFrame.from_records(records)


class CircuitResult(BaseModel):
    circuit: list[int]
    """Query for the players"""

    win_rate: float
    """Success rate of the circuit"""

    counts: TupleKeyIntDict | None = None
    """Raw histogram of the responses, if available"""


class Winrate(BaseModel):
    value: float
    ci95: float
    p_value: float
    var: float

    @classmethod
    def from_circuit_winrates(
        cls, game: "NonlocalGame", winrates: list[float], shots: int
    ):
        wr = np.array(winrates)
        return cls(
            value=wr.mean(),
            ci95=uncertainty.calculate_ci(winrates, shots, d=0.05),
            p_value=uncertainty.calculate_p_value(
                winrates, shots, game.optimal_classical_value
            ),
            var=np.mean(wr * (1 - wr)),  # type: ignore
        )

    def to_str(self, decimals=1):
        # Displays a win rate with a confidence interval, e.g. 98.67(14),
        # where the number(s) in parentheses is the error on the last digit(s)
        winrate, err = self.value, self.ci95
        winrate *= 100
        err *= 100 * 10**decimals

        # Format win rate with decimals
        winrate = np.floor(winrate * 10**decimals) / 10**decimals
        winrate = f"{winrate:.{decimals}f}"

        # Format the error to only keep nonzero digits
        err = int(np.ceil(err))
        return f"{winrate}({err:d})"


class NonlocalGame(BaseModel):
    """Abstractly represents a nonlocal game to be cross-referenced by data"""

    id: UUID4 | Annotated[str, AfterValidator(lambda x: uuid.UUID(x, version=4))] = (
        Field(default_factory=uuid.uuid4)
    )

    name: str
    """Name of the nonlocal game"""

    optimal_classical_value: float
    optimal_quantum_value: float

    publication: Publication | None = None
    """Paper where the game is defined"""

    tags: list[str] = Field(default_factory=list)
    """Any tags to categorize the game"""

    objects: list[Object] = Field(default_factory=list)
    """Any extra data files for the game"""


class Experiment(BaseModel):
    game_id: UUID4 | Annotated[str, AfterValidator(lambda x: uuid.UUID(x, version=4))]
    """Game this experiment implemented"""

    date: datetime
    """Time of the experiment"""

    device: Device
    """Quantum device the experiment was executed on"""

    win_rate: Winrate

    circuit_data: CircuitData

    publication: Publication | None = None
    """Publication demonstrating this experiment, if available"""

    attributes: dict[str, bool | int | float | str] = Field(default_factory=dict)
    """Any extra data attributes"""

    objects: list[Object] = Field(default_factory=list)
    """Any extra associated files"""
