import numpy as np


def calculate_ci(winrates: list[float], shots: int, d: float = 0.05):
    wr = np.array(winrates)
    m = len(winrates)
    n = shots

    sigma2 = np.mean(wr * (1 - wr))
    sigma = np.sqrt(sigma2)
    term1 = 2 * np.log(2 / d) / (3 * n)
    term2 = 2 * np.log(2 / d) / (m * n)
    return term1 + sigma * np.sqrt(term2)


def calculate_p_value(winrates: list[float], shots: int, omega_c: float):
    wr = np.array(winrates)
    m = len(winrates)
    n = shots
    sigma2 = np.mean(wr * (1 - wr))

    eps_c = np.mean(wr) - omega_c

    if eps_c < 0:
        return 1

    return np.exp(-0.5 * n * eps_c**2 / (sigma2 / m + eps_c / 3))
