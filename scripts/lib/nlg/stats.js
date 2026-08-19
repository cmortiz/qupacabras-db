/**
 * Statistics for nonlocal game verification.
 *
 * Three groups of functions live here.
 *
 * 1. A JavaScript port of `nlg_data.uncertainty` (vendored at
 *    `nlg_data_extracted/src/nlg_data/uncertainty.py`), which produced the `win_rate.ci95`,
 *    `win_rate.var` and `win_rate.p_value` fields recorded in `nlg_data_extracted/data/db.json`.
 *    The port is bit-for-bit identical to the Python reference on every vendored record, so the
 *    published corpus can be reproduced exactly rather than approximately. Preserving that
 *    requires preserving two things: the association of the floating-point operations, and the
 *    summation order NumPy uses inside `np.mean` (see `pairwiseSum`). A mathematically equivalent
 *    regrouping changes the last bits and breaks the reproduction.
 *
 * 2. The exact binomial upper tail `binomialTailPValue` and the Clopper-Pearson lower bound
 *    `certifiedWinRateLowerBound` built on the same tail. These are not part of the port and
 *    carry no bit-exactness obligation; they are validated against reference values computed
 *    independently with SciPy, committed in `__tests__/stats.test.js`.
 *
 * 3. The regularized upper incomplete gamma function `gammq(a, x)` and the chi-square survival
 *    function built on it, used by the non-signaling check in `chi-square.js`. SciPy is not
 *    available in CI, so these are validated against committed golden vectors in
 *    `__tests__/fixtures/special-fn-goldens.json`.
 *
 * No file is read at module load time.
 */

/* ------------------------------------------------------------------ *
 * Input validation
 * ------------------------------------------------------------------ */

/**
 * Rejects anything that is not a non-empty array of finite numbers.
 *
 * @param {*} values - Candidate array.
 * @param {string} label - Name used in the thrown message.
 * @returns {void}
 * @throws {TypeError} If `values` is not an array, or holds a non-finite entry.
 * @throws {RangeError} If `values` is empty.
 */
function assertFiniteArray(values, label) {
    if (!Array.isArray(values)) {
        throw new TypeError(label + ' must be an array');
    }
    if (values.length === 0) {
        throw new RangeError(label + ' must not be empty');
    }
    for (let i = 0; i < values.length; i += 1) {
        if (typeof values[i] !== 'number' || !Number.isFinite(values[i])) {
            throw new TypeError(label + '[' + i + '] must be a finite number');
        }
    }
}

/**
 * Rejects anything that is not a finite number.
 *
 * @param {*} value - Candidate number.
 * @param {string} label - Name used in the thrown message.
 * @returns {void}
 * @throws {TypeError} If `value` is not a finite number.
 */
function assertFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(label + ' must be a finite number');
    }
}

/* ------------------------------------------------------------------ *
 * Summation
 * ------------------------------------------------------------------ */

/** Block size at which NumPy stops recursing and switches to eight accumulators. */
const PW_BLOCKSIZE = 128;

/**
 * NumPy's pairwise summation, reproduced exactly.
 *
 * `np.mean` reduces through `np.add.reduce`, which does not sum left to right: below
 * `PW_BLOCKSIZE` it runs eight interleaved accumulators and combines them as
 * `((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7))`, and above it splits recursively on a
 * multiple of eight. Naive left-to-right summation reproduces `db.json` only to about 1e-14;
 * this ordering reproduces all 38 vendored records to 0.0. That exactness is the point of the
 * port, so the ordering is load-bearing and must not be simplified.
 *
 * @param {number[]} values - Values to add.
 * @param {number} start - Index of the first element of the span.
 * @param {number} count - Number of elements in the span.
 * @returns {number} Sum of the span.
 */
function pairwiseSum(values, start, count) {
    if (count < 8) {
        let res = 0;
        for (let i = 0; i < count; i += 1) {
            res += values[start + i];
        }
        return res;
    }

    if (count <= PW_BLOCKSIZE) {
        const r = [
            values[start],
            values[start + 1],
            values[start + 2],
            values[start + 3],
            values[start + 4],
            values[start + 5],
            values[start + 6],
            values[start + 7]
        ];

        let i = 8;
        const limit = count - (count % 8);
        for (; i < limit; i += 8) {
            r[0] += values[start + i];
            r[1] += values[start + i + 1];
            r[2] += values[start + i + 2];
            r[3] += values[start + i + 3];
            r[4] += values[start + i + 4];
            r[5] += values[start + i + 5];
            r[6] += values[start + i + 6];
            r[7] += values[start + i + 7];
        }

        let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
        for (; i < count; i += 1) {
            res += values[start + i];
        }
        return res;
    }

    // Halve, but keep the left span a multiple of the unroll factor.
    let half = Math.floor(count / 2);
    half -= half % 8;
    return pairwiseSum(values, start, half) + pairwiseSum(values, start + half, count - half);
}

/**
 * Arithmetic mean, summed in NumPy's order so that results match `db.json` bit for bit.
 *
 * @param {number[]} values - Non-empty array of finite numbers.
 * @returns {number} The mean.
 * @throws {TypeError} If `values` is not an array of finite numbers.
 * @throws {RangeError} On empty input. Empty input is an error rather than `NaN` so that a
 *   malformed submission fails loudly instead of propagating a silent `NaN` into a published
 *   verification block.
 */
function mean(values) {
    assertFiniteArray(values, 'values');
    return pairwiseSum(values, 0, values.length) / values.length;
}

/**
 * Mean per-question Bernoulli variance, `mean(w * (1 - w))`.
 *
 * This is the `sigma2` of the reference implementation and the `win_rate.var` field of
 * `db.json`.
 *
 * @param {number[]} winrates - Per-question win rates, one entry per question.
 * @returns {number} Mean Bernoulli variance.
 * @throws {TypeError} If `winrates` is not an array of finite numbers.
 * @throws {RangeError} On empty input.
 */
function bernoulliVariance(winrates) {
    assertFiniteArray(winrates, 'winrates');
    const terms = new Array(winrates.length);
    for (let i = 0; i < winrates.length; i += 1) {
        terms[i] = winrates[i] * (1 - winrates[i]);
    }
    return mean(terms);
}

/* ------------------------------------------------------------------ *
 * Uncertainty, ported from nlg_data.uncertainty
 * ------------------------------------------------------------------ */

/**
 * Bernstein-style confidence half-width on the mean win rate.
 *
 * Verbatim port of `calculate_ci`:
 *
 *     sigma2 = np.mean(wr * (1 - wr))
 *     sigma  = np.sqrt(sigma2)
 *     term1  = 2 * np.log(2 / d) / (3 * n)
 *     term2  = 2 * np.log(2 / d) / (m * n)
 *     return term1 + sigma * np.sqrt(term2)
 *
 * The association `term1 + sigma * sqrt(term2)` is preserved deliberately.
 *
 * @param {number[]} winrates - Per-question win rates, one entry per question.
 * @param {number} shots - Shots per question. Constant across questions by construction, since
 *   the estimator is an unweighted mean.
 * @param {number} [d=0.05] - Failure probability, giving a `1 - d` interval at the default.
 * @returns {number} Half-width of the confidence interval.
 * @throws {TypeError} If any argument has the wrong type.
 * @throws {RangeError} On empty `winrates`, or on non-positive `shots` or `d`.
 */
function calculateCi(winrates, shots, d = 0.05) {
    assertFiniteArray(winrates, 'winrates');
    assertFiniteNumber(shots, 'shots');
    assertFiniteNumber(d, 'd');
    if (shots <= 0) {
        throw new RangeError('shots must be positive');
    }
    if (d <= 0) {
        throw new RangeError('d must be positive');
    }

    const m = winrates.length;
    const n = shots;

    const sigma2 = bernoulliVariance(winrates);
    const sigma = Math.sqrt(sigma2);
    const term1 = 2 * Math.log(2 / d) / (3 * n);
    const term2 = 2 * Math.log(2 / d) / (m * n);
    return term1 + sigma * Math.sqrt(term2);
}

/**
 * Bernstein tail bound on the probability that a classical strategy reaches the observed mean.
 *
 * Verbatim port of `calculate_p_value`:
 *
 *     eps_c = np.mean(wr) - omega_c
 *     if eps_c < 0:
 *         return 1
 *     return np.exp(-0.5 * n * eps_c**2 / (sigma2 / m + eps_c / 3))
 *
 * The `eps_c < 0` early return yields exactly `1` (a JavaScript number, since JavaScript draws
 * no integer/float distinction), matching the `p_value: 1` entries in `db.json`. The association
 * inside `Math.exp` is preserved deliberately.
 *
 * Note that the resulting "sigma" is the Gaussian equivalent of a Bernstein tail bound, not a
 * Gaussian standard error.
 *
 * @param {number[]} winrates - Per-question win rates, one entry per question.
 * @param {number} shots - Shots per question.
 * @param {number} omegaC - Optimal classical value of the game.
 * @returns {number} The bound, in `(0, 1]`. Exactly `1` when the mean win rate does not exceed
 *   `omegaC`.
 * @throws {TypeError} If any argument has the wrong type.
 * @throws {RangeError} On empty `winrates` or non-positive `shots`.
 */
function calculatePValue(winrates, shots, omegaC) {
    assertFiniteArray(winrates, 'winrates');
    assertFiniteNumber(shots, 'shots');
    assertFiniteNumber(omegaC, 'omegaC');
    if (shots <= 0) {
        throw new RangeError('shots must be positive');
    }

    const m = winrates.length;
    const n = shots;
    const sigma2 = bernoulliVariance(winrates);

    const epsC = mean(winrates) - omegaC;

    if (epsC < 0) {
        return 1;
    }

    return Math.exp(-0.5 * n * epsC * epsC / (sigma2 / m + epsC / 3));
}

/* ------------------------------------------------------------------ *
 * Exact binomial tail and the certified win-rate lower bound
 * ------------------------------------------------------------------ */

/**
 * One-sided 3-sigma tail probability, `P(Z >= 3)` for a standard normal. Default significance
 * target for `certifiedWinRateLowerBound`.
 */
const THREE_SIGMA_P_TARGET = 0.0013498980316300946;

/** Relative floor below which a further binomial tail term cannot move the sum. */
const BINOMIAL_TAIL_EPS = 1e-18;

/**
 * Rejects anything that is not a positive safe integer.
 *
 * The binomial tail counts whole trials, so a fractional or non-numeric shot count has no exact
 * meaning here, unlike in `calculateCi` where any positive number is a valid scale.
 *
 * @param {*} value - Candidate shot count.
 * @param {string} label - Name used in the thrown message.
 * @returns {void}
 * @throws {TypeError} If `value` is not a finite number.
 * @throws {RangeError} If `value` is not a positive integer.
 */
function assertPositiveInteger(value, label) {
    assertFiniteNumber(value, label);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(label + ' must be a positive integer');
    }
}

/**
 * Pooled win count, `round(shots * sum(winrates))`.
 *
 * Each entry of `winrates` is a per-question win count divided by the same `shots`, so the sum
 * times `shots` is the total win count up to floating-point noise, and rounding recovers the
 * integer. The summation order is irrelevant here for the same reason: the rounding absorbs it.
 *
 * @param {number[]} winrates - Per-question win rates, one entry per question.
 * @param {number} shots - Shots per question.
 * @returns {number} Total number of winning rounds.
 */
function pooledWins(winrates, shots) {
    let total = 0;
    for (let i = 0; i < winrates.length; i += 1) {
        total += winrates[i];
    }
    return Math.round(shots * total);
}

/**
 * Upper tail of the binomial distribution, `P(Bin(N, p) >= k)`, computed in log space.
 *
 * The leading term `pmf(k)` is evaluated once through `lgamma`, and the remaining terms follow
 * by the multiplicative recurrence `pmf(j + 1) / pmf(j) = ((N - j) / (j + 1)) * (p / (1 - p))`,
 * so no factorial or power is ever formed outside log space and the result stays finite down to
 * the underflow limit. The terms are unimodal in `j`, so once the recurrence ratio drops below 1
 * a term smaller than `BINOMIAL_TAIL_EPS` of the accumulated sum bounds everything after it.
 *
 * @param {number} N - Number of trials, a positive integer.
 * @param {number} k - Threshold win count.
 * @param {number} p - Success probability.
 * @returns {number} `P(Bin(N, p) >= k)`, in `[0, 1]`. Exactly `1` when `k <= 0` or `p >= 1`,
 *   exactly `0` when `k > N` or when `p <= 0` with `k >= 1`.
 */
function binomialUpperTail(N, k, p) {
    if (k <= 0) {
        return 1;
    }
    if (k > N) {
        return 0;
    }
    if (p <= 0) {
        return 0;
    }
    if (p >= 1) {
        return 1;
    }

    const logPmf = lgamma(N + 1) - lgamma(k + 1) - lgamma(N - k + 1) +
        k * Math.log(p) + (N - k) * Math.log(1 - p);

    const odds = p / (1 - p);
    let term = 1;
    let sum = 1;
    for (let j = k; j < N; j += 1) {
        const ratio = ((N - j) / (j + 1)) * odds;
        term *= ratio;
        sum += term;
        if (ratio < 1 && term < sum * BINOMIAL_TAIL_EPS) {
            break;
        }
    }

    const tail = Math.exp(logPmf + Math.log(sum));
    return tail > 1 ? 1 : tail;
}

/**
 * Exact one-sided binomial upper tail on the pooled win count: `P(Bin(N, omegaC) >= k)` with
 * `k = round(shots * sum(winrates))` and `N = winrates.length * shots`.
 *
 * Exactly valid for stratified independent non-identical Bernoulli trials with equal shots per
 * circuit: under a classical model the per-question win probabilities may differ, but their mean
 * is at most `omegaC`, so the sum of the per-round means is at most `N * omegaC`. Hoeffding
 * (1956), Theorem 5, gives that among independent Bernoulli trials with a fixed sum of means the
 * i.i.d. binomial tail dominates every other tail at or above the mean, and the binomial tail is
 * monotone increasing in its mean, so `P(Bin(N, omegaC) >= k)` bounds the true tail from above.
 * Equal shots per question are load-bearing: they are what makes the sum of the per-round means
 * proportional to the mean of the per-question probabilities, the quantity `omegaC` bounds.
 *
 * This is the sharp counterpart of `calculatePValue`. The Bernstein bound is kept unchanged for
 * reproducibility of the published corpus; this tail is exactly valid and never larger than the
 * true significance, so the two are reported side by side rather than one replacing the other.
 *
 * @param {number[]} winrates - Per-question win rates, one entry per question.
 * @param {number} shots - Shots per question, a positive integer, constant across questions.
 * @param {number} omegaC - Optimal classical value of the game, in `[0, 1]`.
 * @returns {number} The tail probability, in `[0, 1]`. Exactly `1` when `k <= N * omegaC`.
 * @throws {TypeError} If any argument has the wrong type.
 * @throws {RangeError} On empty `winrates`, a non-positive-integer `shots`, or `omegaC` outside
 *   `[0, 1]`.
 */
function binomialTailPValue(winrates, shots, omegaC) {
    assertFiniteArray(winrates, 'winrates');
    assertPositiveInteger(shots, 'shots');
    assertFiniteNumber(omegaC, 'omegaC');
    if (omegaC < 0 || omegaC > 1) {
        throw new RangeError('omegaC must lie in [0, 1]');
    }

    const k = pooledWins(winrates, shots);
    const N = winrates.length * shots;

    if (k <= N * omegaC) {
        return 1;
    }
    return binomialUpperTail(N, k, omegaC);
}

/**
 * Clopper-Pearson one-sided lower confidence bound on the win rate.
 *
 * The largest `omega` in `[0, 1]` whose binomial upper tail at the pooled win count does not
 * exceed `pTarget`: every rate at or below the returned value is rejected at the target
 * significance by the exact tail, so the true win rate exceeds it with confidence
 * `1 - pTarget`. Found by bisection, 60 halvings of `[0, 1]`, which pins the bound to within
 * `2^-60` and is far below the statistical width at any realistic shot count. The tail is
 * monotone increasing in `omega`, which is what makes the bisection valid.
 *
 * The same equal-shots caveat as `binomialTailPValue` applies: the pooled count is a binomial
 * count of the mean win rate only when every question ran the same number of shots.
 *
 * @param {number[]} winrates - Per-question win rates, one entry per question.
 * @param {number} shots - Shots per question, a positive integer, constant across questions.
 * @param {number} [pTarget=THREE_SIGMA_P_TARGET] - One-sided significance target, in `(0, 1)`.
 *   The default is the one-sided 3-sigma tail.
 * @returns {number} The lower bound, in `[0, 1]`. Exactly `0` when no rate can be rejected,
 *   which happens whenever the pooled win count is `0`.
 * @throws {TypeError} If any argument has the wrong type.
 * @throws {RangeError} On empty `winrates`, a non-positive-integer `shots`, or `pTarget`
 *   outside `(0, 1)`.
 */
function certifiedWinRateLowerBound(winrates, shots, pTarget = THREE_SIGMA_P_TARGET) {
    assertFiniteArray(winrates, 'winrates');
    assertPositiveInteger(shots, 'shots');
    assertFiniteNumber(pTarget, 'pTarget');
    if (pTarget <= 0 || pTarget >= 1) {
        throw new RangeError('pTarget must lie in (0, 1)');
    }

    const k = pooledWins(winrates, shots);
    const N = winrates.length * shots;

    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (binomialUpperTail(N, k, mid) <= pTarget) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/* ------------------------------------------------------------------ *
 * Incomplete gamma and the chi-square survival function
 * ------------------------------------------------------------------ */

/** Lanczos parameter `g`, paired with the 15 coefficients below. */
const LANCZOS_G = 607 / 128;

/**
 * Lanczos coefficients for `g = 607/128`, giving about 15 correct digits for real `x > 0`.
 *
 * Written as the shortest decimal that round-trips through a double. The published coefficients
 * carry about 20 digits, which no double can hold, so the longer forms would denote exactly these
 * same values while tripping `no-loss-of-precision`.
 */
const LANCZOS_COEFFICIENTS = [
    0.9999999999999971,
    57.15623566586292,
    -59.59796035547549,
    14.136097974741746,
    -0.4919138160976202,
    0.00003399464998481189,
    0.00004652362892704858,
    -0.00009837447530487956,
    0.0001580887032249125,
    -0.00021026444172410488,
    0.00021743961811521265,
    -0.0001643181065367639,
    0.00008441822398385275,
    -0.000026190838401581408,
    0.0000036899182659531625
];

/** Relative tolerance for the series and continued fraction below. */
const GAMMA_EPS = 3e-16;

/** Floor used to keep the continued fraction away from a division by zero. */
const GAMMA_FPMIN = Number.MIN_VALUE / GAMMA_EPS;

/**
 * Iteration cap. The committed goldens need at most 131 series terms and 59 continued-fraction
 * terms; the cap is well above that so that hitting it means genuine non-convergence.
 */
const GAMMA_ITMAX = 10000;

/**
 * Natural logarithm of the gamma function, by the Lanczos approximation.
 *
 * @param {number} x - Strictly positive argument.
 * @returns {number} `ln(Gamma(x))`.
 * @throws {RangeError} If `x` is not strictly positive.
 */
function lgamma(x) {
    assertFiniteNumber(x, 'x');
    if (x <= 0) {
        throw new RangeError('lgamma requires x > 0');
    }
    let series = LANCZOS_COEFFICIENTS[0];
    for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i += 1) {
        series += LANCZOS_COEFFICIENTS[i] / (x + i - 1);
    }
    const t = x + LANCZOS_G - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (x - 0.5) * Math.log(t) - t + Math.log(series);
}

/**
 * Lower regularized incomplete gamma `P(a, x)` by its series expansion. Convergent and accurate
 * for `x < a + 1`.
 *
 * @param {number} a - Shape parameter, strictly positive.
 * @param {number} x - Argument, strictly positive.
 * @returns {number} `P(a, x)`.
 * @throws {Error} If the series does not converge within `GAMMA_ITMAX` terms.
 */
function gammaSeries(a, x) {
    const gln = lgamma(a);
    let ap = a;
    let sum = 1 / a;
    let del = sum;

    for (let i = 0; i < GAMMA_ITMAX; i += 1) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * GAMMA_EPS) {
            return sum * Math.exp(-x + a * Math.log(x) - gln);
        }
    }

    throw new Error(
        'incomplete gamma series failed to converge for a=' + a + ', x=' + x
    );
}

/**
 * Upper regularized incomplete gamma `Q(a, x)` by the modified Lentz continued fraction.
 * Convergent and accurate for `x >= a + 1`.
 *
 * @param {number} a - Shape parameter, strictly positive.
 * @param {number} x - Argument, strictly positive.
 * @returns {number} `Q(a, x)`.
 * @throws {Error} If the continued fraction does not converge within `GAMMA_ITMAX` terms.
 */
function gammaContinuedFraction(a, x) {
    const gln = lgamma(a);
    let b = x + 1 - a;
    let c = 1 / GAMMA_FPMIN;
    let d = 1 / b;
    let h = d;

    for (let i = 1; i <= GAMMA_ITMAX; i += 1) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < GAMMA_FPMIN) {
            d = GAMMA_FPMIN;
        }
        c = b + an / c;
        if (Math.abs(c) < GAMMA_FPMIN) {
            c = GAMMA_FPMIN;
        }
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) <= GAMMA_EPS) {
            return Math.exp(-x + a * Math.log(x) - gln) * h;
        }
    }

    throw new Error(
        'incomplete gamma continued fraction failed to converge for a=' + a + ', x=' + x
    );
}

/**
 * Regularized upper incomplete gamma function `Q(a, x)`, equivalently
 * `scipy.special.gammaincc(a, x)`.
 *
 * Uses the series expansion below `x = a + 1` and the continued fraction at or above it, which
 * is where each is well conditioned. Accurate to about 2.3e-13 relative against the committed
 * SciPy goldens over `a` in `[0.5, 220.5]` and results down to 2.6e-157.
 *
 * @param {number} a - Shape parameter, strictly positive.
 * @param {number} x - Argument, non-negative.
 * @returns {number} `Q(a, x)`, in `[0, 1]`. Exactly `1` at `x === 0`.
 * @throws {TypeError} If either argument is not a finite number.
 * @throws {RangeError} If `a <= 0` or `x < 0`.
 * @throws {Error} If the underlying expansion fails to converge.
 */
function gammq(a, x) {
    assertFiniteNumber(a, 'a');
    assertFiniteNumber(x, 'x');
    if (a <= 0) {
        throw new RangeError('gammq requires a > 0');
    }
    if (x < 0) {
        throw new RangeError('gammq requires x >= 0');
    }
    if (x === 0) {
        return 1;
    }
    if (x < a + 1) {
        return 1 - gammaSeries(a, x);
    }
    return gammaContinuedFraction(a, x);
}

/**
 * Chi-square survival function, `P(X > x)` for `X ~ chi2(df)`. Equal to `gammq(df / 2, x / 2)`.
 *
 * @param {number} x - Test statistic, any real value. Non-positive `x` returns `1`.
 * @param {number} df - Degrees of freedom, at least 1. Non-integer values are allowed.
 * @returns {number} The survival function value, in `[0, 1]`.
 * @throws {TypeError} If either argument is not a finite number.
 * @throws {RangeError} If `df < 1`.
 * @throws {Error} If the underlying expansion fails to converge.
 */
function chiSquareSf(x, df) {
    assertFiniteNumber(x, 'x');
    assertFiniteNumber(df, 'df');
    if (df < 1) {
        throw new RangeError('chiSquareSf requires df >= 1');
    }
    if (x <= 0) {
        return 1;
    }
    return gammq(df / 2, x / 2);
}

module.exports = {
    calculateCi,
    calculatePValue,
    binomialTailPValue,
    certifiedWinRateLowerBound,
    mean,
    bernoulliVariance,
    gammq,
    chiSquareSf
};
