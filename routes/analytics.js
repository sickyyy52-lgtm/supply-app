const express = require('express');
const DailyStat = require('../models/DailyStat');
const MonthlyStat = require('../models/MonthlyStat');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const {
    getLiveMetrics,
    ensureDailySnapshots,
    ensureMonthlySnapshots,
    generateDailyInsights
} = require('../utils/analytics');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

function parseLimit(value, fallback, max) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
}

router.get('/live-metrics', async(req, res) => {
    try {
        const data = await getLiveMetrics({ since: req.query.since });
        res.json(data);
    } catch (error) {
        console.error('Live metrics error:', error);
        res.status(500).json({ message: 'Error fetching live metrics', error: error.message });
    }
});

router.get('/stats/daily', async(req, res) => {
    try {
        const days = parseLimit(req.query.days, 14, 90);
        const month = req.query.month ? String(req.query.month).trim().slice(0, 7) : '';

        if (month && !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ message: 'Month must be in YYYY-MM format' });
        }

        if (!month) {
            await ensureDailySnapshots(days);
        }

        const query = month ? { date: { $regex: `^${month}` } } : {};
        const stats = await DailyStat.find(query)
            .sort({ date: -1 })
            .limit(month ? 31 : days)
            .lean();
        const orderedStats = stats.reverse();

        res.json({
            stats: orderedStats,
            insights: generateDailyInsights(orderedStats)
        });
    } catch (error) {
        console.error('Daily stats error:', error);
        res.status(500).json({ message: 'Error fetching daily stats', error: error.message });
    }
});

router.get('/stats/monthly', async(req, res) => {
    try {
        const months = parseLimit(req.query.months, 12, 36);
        await ensureMonthlySnapshots(months);

        const stats = await MonthlyStat.find({})
            .sort({ month: -1 })
            .limit(months)
            .lean();

        res.json({
            stats: stats.reverse()
        });
    } catch (error) {
        console.error('Monthly stats error:', error);
        res.status(500).json({ message: 'Error fetching monthly stats', error: error.message });
    }
});

module.exports = router;
