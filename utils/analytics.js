const Order = require('../models/Order');
const PaymentProof = require('../models/PaymentProof');
const DailyStat = require('../models/DailyStat');
const MonthlyStat = require('../models/MonthlyStat');

const DAY_MS = 24 * 60 * 60 * 1000;
const BUSINESS_OFFSET_MINUTES = Number(process.env.BUSINESS_TIMEZONE_OFFSET_MINUTES || 330);
const BUSINESS_OFFSET_MS = BUSINESS_OFFSET_MINUTES * 60 * 1000;

function roundMoney(value) {
    const number = Number(value || 0);
    return Number(number.toFixed(2));
}

function safeRate(envName, fallback) {
    const value = Number(process.env[envName]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function analyticsConfig() {
    return {
        productCostRate: safeRate('ANALYTICS_PRODUCT_COST_RATE', 0.65),
        deliveryCostPerOrder: safeRate('ANALYTICS_DELIVERY_COST_PER_ORDER', 0),
        codReturnLossRate: safeRate('ANALYTICS_COD_RETURN_LOSS_RATE', 0.1),
        paymentFailLossPerOrder: safeRate('ANALYTICS_PAYMENT_FAIL_LOSS_PER_ORDER', 0)
    };
}

function toBusinessDateKey(date = new Date()) {
    return new Date(date.getTime() + BUSINESS_OFFSET_MS).toISOString().slice(0, 10);
}

function dateKeyToUtcRange(dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    const startMs = Date.UTC(year, month - 1, day) - BUSINESS_OFFSET_MS;
    return {
        start: new Date(startMs),
        end: new Date(startMs + DAY_MS)
    };
}

function addDaysToDateKey(dateKey, days) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function monthKeyFromDateKey(dateKey) {
    return String(dateKey).slice(0, 7);
}

function currentMonthKey() {
    return monthKeyFromDateKey(toBusinessDateKey(new Date()));
}

function addMonthsToMonthKey(monthKey, months) {
    const [year, month] = String(monthKey).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
}

function monthRangeToDateKeys(monthKey) {
    const [year, month] = String(monthKey).split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const keys = [];

    for (let cursor = start.getTime(); cursor < end.getTime(); cursor += DAY_MS) {
        keys.push(new Date(cursor).toISOString().slice(0, 10));
    }

    return keys;
}

function dayLabel(dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function normalizeMethod(method) {
    return method === 'Cash on Delivery' ? 'COD' : String(method || 'COD');
}

function isRejected(order) {
    return ['Rejected', 'Cancelled'].includes(order.status) || order.payment_status === 'REJECTED';
}

function sumOrders(orders) {
    return roundMoney(orders.reduce((sum, order) => sum + Number(order.total_price || 0), 0));
}

function revenueEligibleCreatedOrder(order) {
    const method = normalizeMethod(order.payment_method);
    if (isRejected(order)) return false;
    if (method === 'COD') return order.payment_status === 'COD_CONFIRMED';
    if (method === 'Wallet') return order.payment_status === 'PAID';
    return false;
}

async function approvedUpiOrdersForRange(start, end) {
    const approvedProofs = await PaymentProof.find({
        type: 'order',
        status: 'approved',
        reviewed_at: { $gte: start, $lt: end }
    }).lean();

    const orderIds = [...new Set(approvedProofs.map((proof) => Number(proof.reference_id)).filter(Boolean))];
    if (!orderIds.length) return [];

    return Order.find({
        id: { $in: orderIds },
        payment_method: 'UPI',
        payment_status: 'PAID'
    }).lean();
}

async function calculateStatsForDate(dateKey) {
    const config = analyticsConfig();
    const { start, end } = dateKeyToUtcRange(dateKey);

    const [createdOrders, approvedUpiOrders, rejectedProofs] = await Promise.all([
        Order.find({ createdAt: { $gte: start, $lt: end } }).lean(),
        approvedUpiOrdersForRange(start, end),
        PaymentProof.find({
            type: 'order',
            status: 'rejected',
            reviewed_at: { $gte: start, $lt: end }
        }).lean()
    ]);

    const codOrders = createdOrders.filter((order) => normalizeMethod(order.payment_method) === 'COD');
    const walletOrders = createdOrders.filter((order) => normalizeMethod(order.payment_method) === 'Wallet');
    const eligibleCodOrders = codOrders.filter(revenueEligibleCreatedOrder);
    const eligibleWalletOrders = walletOrders.filter(revenueEligibleCreatedOrder);
    const cancelledCodOrders = codOrders.filter(isRejected);
    const refundOrders = createdOrders.filter((order) => normalizeMethod(order.payment_method) !== 'COD' && isRejected(order));

    const codRevenue = sumOrders(eligibleCodOrders);
    const upiRevenue = sumOrders(approvedUpiOrders.filter((order) => !isRejected(order)));
    const walletRevenue = sumOrders(eligibleWalletOrders);
    const revenue = roundMoney(codRevenue + upiRevenue + walletRevenue);
    const paidOrders = eligibleCodOrders.length + approvedUpiOrders.length + eligibleWalletOrders.length;
    const productCost = roundMoney(revenue * config.productCostRate);
    const deliveryCost = roundMoney(paidOrders * config.deliveryCostPerOrder);
    const codReturns = roundMoney(sumOrders(cancelledCodOrders) * config.codReturnLossRate);
    const refunds = sumOrders(refundOrders);
    const paymentFailLoss = roundMoney(rejectedProofs.length * config.paymentFailLossPerOrder);
    const profit = roundMoney(revenue - (productCost + deliveryCost + codReturns + refunds + paymentFailLoss));
    const totalOrders = createdOrders.length;

    return {
        date: dateKey,
        day_label: dayLabel(dateKey),
        revenue,
        profit,
        cod_revenue: codRevenue,
        upi_revenue: upiRevenue,
        wallet_revenue: walletRevenue,
        total_orders: totalOrders,
        paid_orders: paidOrders,
        conversion_rate: totalOrders ? roundMoney((paidOrders / totalOrders) * 100) : 0,
        product_cost: productCost,
        delivery_cost: deliveryCost,
        cod_returns: codReturns,
        refunds,
        payment_fail_loss: paymentFailLoss,
        cod_cancellations: cancelledCodOrders.length,
        failed_payments: rejectedProofs.length
    };
}

async function upsertDailySnapshot(dateKey) {
    const todayKey = toBusinessDateKey(new Date());
    if (dateKey >= todayKey) {
        throw new Error('Daily snapshots can only be saved for completed business days');
    }

    const stat = await calculateStatsForDate(dateKey);
    return DailyStat.findOneAndUpdate(
        { date: dateKey },
        { $set: stat },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
}

async function ensureDailySnapshots(days = 14) {
    const todayKey = toBusinessDateKey(new Date());
    const keys = [];

    for (let offset = days; offset >= 1; offset--) {
        keys.push(addDaysToDateKey(todayKey, -offset));
    }

    const existing = await DailyStat.find({ date: { $in: keys } }).select('date').lean();
    const existingKeys = new Set(existing.map((stat) => stat.date));

    for (const key of keys) {
        if (!existingKeys.has(key)) {
            await upsertDailySnapshot(key);
        }
    }
}

async function ensureDailySnapshotsForMonth(monthKey) {
    const todayKey = toBusinessDateKey(new Date());
    const keys = monthRangeToDateKeys(monthKey).filter((key) => key < todayKey);
    const existing = await DailyStat.find({ date: { $in: keys } }).select('date').lean();
    const existingKeys = new Set(existing.map((stat) => stat.date));

    for (const key of keys) {
        if (!existingKeys.has(key)) {
            await upsertDailySnapshot(key);
        }
    }
}

async function aggregateMonthlySnapshot(monthKey) {
    await ensureDailySnapshotsForMonth(monthKey);

    const dailyStats = await DailyStat.find({ date: { $regex: `^${monthKey}` } }).sort({ date: 1 }).lean();
    const totalRevenue = roundMoney(dailyStats.reduce((sum, stat) => sum + Number(stat.revenue || 0), 0));
    const totalProfit = roundMoney(dailyStats.reduce((sum, stat) => sum + Number(stat.profit || 0), 0));
    const totalOrders = dailyStats.reduce((sum, stat) => sum + Number(stat.total_orders || 0), 0);
    const codRevenue = dailyStats.reduce((sum, stat) => sum + Number(stat.cod_revenue || 0), 0);
    const upiRevenue = dailyStats.reduce((sum, stat) => sum + Number(stat.upi_revenue || 0), 0);
    const walletRevenue = dailyStats.reduce((sum, stat) => sum + Number(stat.wallet_revenue || 0), 0);
    const bestDay = dailyStats.reduce((best, stat) => (!best || Number(stat.revenue || 0) > Number(best.revenue || 0) ? stat : best), null);
    const worstDay = dailyStats.reduce((worst, stat) => (!worst || Number(stat.revenue || 0) < Number(worst.revenue || 0) ? stat : worst), null);

    return {
        month: monthKey,
        total_revenue: totalRevenue,
        total_profit: totalProfit,
        total_orders: totalOrders,
        cod_percentage: totalRevenue ? roundMoney((codRevenue / totalRevenue) * 100) : 0,
        upi_percentage: totalRevenue ? roundMoney((upiRevenue / totalRevenue) * 100) : 0,
        wallet_percentage: totalRevenue ? roundMoney((walletRevenue / totalRevenue) * 100) : 0,
        best_day: {
            date: bestDay ? bestDay.date : '',
            revenue: bestDay ? Number(bestDay.revenue || 0) : 0
        },
        worst_day: {
            date: worstDay ? worstDay.date : '',
            revenue: worstDay ? Number(worstDay.revenue || 0) : 0
        },
        cod_returns: roundMoney(dailyStats.reduce((sum, stat) => sum + Number(stat.cod_returns || 0), 0)),
        refunds: roundMoney(dailyStats.reduce((sum, stat) => sum + Number(stat.refunds || 0), 0)),
        payment_fail_loss: roundMoney(dailyStats.reduce((sum, stat) => sum + Number(stat.payment_fail_loss || 0), 0))
    };
}

async function upsertMonthlySnapshot(monthKey) {
    if (monthKey >= currentMonthKey()) {
        throw new Error('Monthly snapshots can only be saved for completed months');
    }

    const stat = await aggregateMonthlySnapshot(monthKey);
    return MonthlyStat.findOneAndUpdate(
        { month: monthKey },
        { $set: stat },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
}

async function ensureMonthlySnapshots(months = 12) {
    const current = currentMonthKey();
    const keys = [];

    for (let offset = months; offset >= 1; offset--) {
        keys.push(addMonthsToMonthKey(current, -offset));
    }

    const existing = await MonthlyStat.find({ month: { $in: keys } }).select('month').lean();
    const existingKeys = new Set(existing.map((stat) => stat.month));

    for (const key of keys) {
        if (!existingKeys.has(key)) {
            await upsertMonthlySnapshot(key);
        }
    }
}

function liveEventTime(order, approvedProofByOrderId) {
    if (normalizeMethod(order.payment_method) === 'UPI' && approvedProofByOrderId.has(Number(order.id))) {
        return approvedProofByOrderId.get(Number(order.id)).reviewed_at || order.updatedAt || order.createdAt;
    }
    return order.createdAt;
}

async function getLiveMetrics(options = {}) {
    const todayKey = toBusinessDateKey(new Date());
    const { start, end } = dateKeyToUtcRange(todayKey);
    const since = options.since ? new Date(options.since) : null;

    const [createdTodayOrders, approvedProofs, summary] = await Promise.all([
        Order.find({ createdAt: { $gte: start, $lt: end } }).lean(),
        PaymentProof.find({
            type: 'order',
            status: 'approved',
            reviewed_at: { $gte: start, $lt: end }
        }).lean(),
        calculateStatsForDate(todayKey)
    ]);

    const approvedProofByOrderId = new Map(
        approvedProofs.map((proof) => [Number(proof.reference_id), proof])
    );
    const approvedUpiOrderIds = [...approvedProofByOrderId.keys()];
    const approvedUpiOrders = approvedUpiOrderIds.length ?
        await Order.find({ id: { $in: approvedUpiOrderIds }, payment_method: 'UPI' }).lean() :
        [];
    const createdOrderIds = new Set(createdTodayOrders.map((order) => Number(order.id)));
    const eventOrders = createdTodayOrders.concat(
        approvedUpiOrders.filter((order) => !createdOrderIds.has(Number(order.id)))
    );

    const events = eventOrders.map((order) => {
        const method = normalizeMethod(order.payment_method);
        const isUpiApproved = method === 'UPI' && approvedProofByOrderId.has(Number(order.id)) && order.payment_status === 'PAID';
        const isCodRevenue = method === 'COD' && revenueEligibleCreatedOrder(order);
        const isWalletRevenue = method === 'Wallet' && revenueEligibleCreatedOrder(order);
        const revenueDelta = isUpiApproved || isCodRevenue || isWalletRevenue ? Number(order.total_price || 0) : 0;
        const event =
            isUpiApproved ? 'UPI payment verified' :
            isCodRevenue ? 'COD confirmed' :
            isWalletRevenue ? 'Wallet paid' :
            method === 'UPI' ? 'UPI proof submitted' :
            'Order placed';

        return {
            time: liveEventTime(order, approvedProofByOrderId),
            orderId: order.id,
            payment_method: method,
            event,
            revenueDelta: roundMoney(revenueDelta)
        };
    }).sort((left, right) => new Date(left.time) - new Date(right.time) || Number(left.orderId) - Number(right.orderId));

    let cumulativeRevenue = 0;
    const points = [];

    events.forEach((event) => {
        cumulativeRevenue = roundMoney(cumulativeRevenue + event.revenueDelta);
        const eventDate = new Date(event.time);

        if (since && eventDate <= since) return;

        points.push({
            time: eventDate.toISOString(),
            label: eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            revenue: cumulativeRevenue,
            revenue_delta: event.revenueDelta,
            event: event.event,
            order_id: event.orderId,
            payment_method: event.payment_method
        });
    });

    return {
        date: todayKey,
        server_time: new Date().toISOString(),
        cursor: points.length ? points[points.length - 1].time : (since ? since.toISOString() : ''),
        summary,
        points
    };
}

function generateDailyInsights(stats) {
    const insights = [];
    const currentWeek = stats.slice(-7);
    const previousWeek = stats.slice(-14, -7);
    const currentRevenue = currentWeek.reduce((sum, stat) => sum + Number(stat.revenue || 0), 0);
    const previousRevenue = previousWeek.reduce((sum, stat) => sum + Number(stat.revenue || 0), 0);
    const currentUpi = currentWeek.reduce((sum, stat) => sum + Number(stat.upi_revenue || 0), 0);
    const previousUpi = previousWeek.reduce((sum, stat) => sum + Number(stat.upi_revenue || 0), 0);
    const codLoss = currentWeek.reduce((sum, stat) => sum + Number(stat.cod_returns || 0), 0);
    const refundLoss = currentWeek.reduce((sum, stat) => sum + Number(stat.refunds || 0), 0);
    const failedLoss = currentWeek.reduce((sum, stat) => sum + Number(stat.payment_fail_loss || 0), 0);

    if (previousRevenue > 0) {
        const change = roundMoney(((currentRevenue - previousRevenue) / previousRevenue) * 100);
        insights.push(`Revenue ${change >= 0 ? 'increased' : 'decreased'} ${Math.abs(change)}% this week`);
    } else if (currentRevenue > 0) {
        insights.push('Revenue started growing this week with fresh paid orders');
    }

    if (currentRevenue > 0 && previousRevenue > 0) {
        const currentUpiShare = currentUpi / currentRevenue;
        const previousUpiShare = previousUpi / previousRevenue;
        insights.push(currentUpiShare >= previousUpiShare ? 'UPI conversion is improving' : 'UPI share dipped versus last week');
    }

    const biggestLoss = [
        ['COD causing highest loss', codLoss],
        ['Refunds are the biggest loss source', refundLoss],
        ['Failed payments are the biggest loss source', failedLoss]
    ].sort((left, right) => right[1] - left[1])[0];

    if (biggestLoss && biggestLoss[1] > 0) {
        insights.push(biggestLoss[0]);
    } else {
        insights.push('No major losses detected in the latest snapshot window');
    }

    return insights;
}

async function runScheduledSnapshot() {
    const todayKey = toBusinessDateKey(new Date());
    const yesterdayKey = addDaysToDateKey(todayKey, -1);
    await upsertDailySnapshot(yesterdayKey);

    if (todayKey.endsWith('-01')) {
        await upsertMonthlySnapshot(addMonthsToMonthKey(monthKeyFromDateKey(todayKey), -1));
    }
}

function msUntilNextBusinessMidnight() {
    const now = new Date();
    const businessNow = new Date(now.getTime() + BUSINESS_OFFSET_MS);
    const nextBusinessMidnight = Date.UTC(
        businessNow.getUTCFullYear(),
        businessNow.getUTCMonth(),
        businessNow.getUTCDate() + 1
    ) - BUSINESS_OFFSET_MS;
    return Math.max(1000, nextBusinessMidnight - now.getTime());
}

function startAnalyticsScheduler() {
    ensureDailySnapshots(14)
        .then(() => ensureMonthlySnapshots(12))
        .catch((error) => console.error('[analytics] Startup snapshot backfill failed:', error));

    const scheduleNext = () => {
        const timer = setTimeout(async() => {
            try {
                await runScheduledSnapshot();
                console.log('[analytics] Scheduled business snapshot saved.');
            } catch (error) {
                console.error('[analytics] Scheduled snapshot failed:', error);
            } finally {
                scheduleNext();
            }
        }, msUntilNextBusinessMidnight());

        if (typeof timer.unref === 'function') timer.unref();
    };

    scheduleNext();
}

module.exports = {
    getLiveMetrics,
    ensureDailySnapshots,
    ensureMonthlySnapshots,
    upsertDailySnapshot,
    upsertMonthlySnapshot,
    generateDailyInsights,
    startAnalyticsScheduler
};
