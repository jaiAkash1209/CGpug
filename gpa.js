export function calculateWeightedPoint(credits, point) {
    const safeCredits = Number(credits) || 0;
    const safePoint = Number(point) || 0;

    return safeCredits > 0 && safePoint >= 0 ? safeCredits * safePoint : 0;
}

export function calculateGpa(rows) {
    let totalCredits = 0;
    let totalWeighted = 0;

    for (const row of rows) {
        const credits = Number(row?.credits) || 0;
        const point = Number(row?.point) || 0;
        const weighted = calculateWeightedPoint(credits, point);

        totalCredits += credits > 0 ? credits : 0;
        totalWeighted += weighted;
    }

    return totalCredits > 0 ? totalWeighted / totalCredits : 0;
}
