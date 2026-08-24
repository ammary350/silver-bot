const os = require('os');
const config = require('../../config');

global.__botHealth = global.__botHealth || {
	state: 'unknown',
	errors: 0,
	disconnects: 0,
	lastError: 'none',
	bootedAt: Date.now()
};

const getCpuPercent = () => {
	const cpus = os.cpus();
	if (!cpus.length) return 0;

	let total = 0;
	let idle = 0;
	for (const cpu of cpus) {
		const times = cpu.times;
		total += times.user + times.nice + times.sys + times.idle + times.irq;
		idle += times.idle;
	}

	const used = total - idle;
	return Number(((used / total) * 100 || 0).toFixed(1));
};

const formatBytes = (bytes) => {
	const value = Number(bytes || 0) / 1024 / 1024;
	if (value >= 1024) return `${(value / 1024).toFixed(2)} GB`;
	return `${value.toFixed(1)} MB`;
};

module.exports = {
	name: 'status',
	aliases: ['botstatus', 'botinfo'],
	category: 'general',
	description: 'Show bot status and statistics',
	usage: '.status',

	async execute(sock, msg, args, extra) {
		const health = global.__botHealth || { state: 'unknown', errors: 0, disconnects: 0, lastError: 'none' };
		const uptimeSec = process.uptime();
		const sysUptimeSec = os.uptime();
		const uptimeStr = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${Math.floor(uptimeSec % 60)}s`;
		const systemUptime = `${Math.floor(sysUptimeSec / 3600)}h ${Math.floor((sysUptimeSec % 3600) / 60)}m ${Math.floor(sysUptimeSec % 60)}s`;

		const totalMem = os.totalmem();
		const freeMem = os.freemem();
		const usedMem = totalMem - freeMem;
		const connectionState = sock?.ws?.readyState === 1 ? 'connected' : (health.state || 'unknown');

		let groupCount = 0;
		try {
			const store = sock?.store;
			if (store && store.groupMetadata) {
				groupCount = Object.keys(store.groupMetadata).length;
			}
		} catch (e) {}

		const text = `╭━━『 *Bot Status* 』━━╮\n\n` +
			`⏱️ *System Uptime:* ${systemUptime}\n` +
			`🧠 *App Uptime:* ${uptimeStr}\n` +
			`💾 *RAM:* ${formatBytes(usedMem)} used / ${formatBytes(totalMem)} total\n` +
			`📈 *CPU:* ${getCpuPercent()}%\n` +
			`🩺 *Connection:* ${connectionState}\n` +
			`⚠️ *Socket Errors:* ${Number(health.errors || 0)}\n` +
			`🔌 *Socket Drops:* ${Number(health.disconnects || 0)}\n` +
			`👥 *Groups:* ${groupCount}\n` +
			`📦 *Version:* 1.0.0\n` +
			`🏷️ *Prefix:* ${config.prefix}\n` +
			`🤖 *Name:* ${config.botName}\n\n> ${config.botName}\n` +
			`╰━━━━━━━━━━━━━━━━━╯`;

		await extra.reply(text);
	}
};
