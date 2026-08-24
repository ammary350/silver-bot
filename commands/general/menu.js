const config = require('../../config');

const menuSections = {
  general: {
    icon: '🧭',
    label: 'عام',
    cmds: ['menu', 'ping', 'owner', 'alive', 'status', 'uptime', 'sticker', 'tts', 'qr', 'attp', 'getpp', 'viewonce', 'chat', 'botstats', 'astats', 'setstatsgroup']
  },
  roles: {
    icon: '👤',
    label: 'الرتب',
    cmds: ['addadm', 'deladm', 'addco', 'delco', 'roles', 'resetroles']
  },
  admin: {
    icon: '🛡️',
    label: 'الإدارة',
    cmds: ['kick', 'promote', 'demote', 'mute', 'unmute', 'warn', 'resetwarn', 'tagall', 'hidetag', 'antilink', 'antitag', 'antiacc', 'welcome', 'setwelcome', 'goodbye', 'setgoodbye', 'clean', 'delete', 'grouplink', 'ginfo', 'setrules', 'reqs', 'approveall', 'setreqmsg', 'linksetup', 'links', 'linkhide']
  },
  protection: {
    icon: '🔒',
    label: 'الحماية',
    cmds: ['detc', 'antiword', 'addword', 'delword', 'antispam', 'spamlimit', 'spamtime', 'antidelete', 'lock', 'unlock', 'panic', 'rules', 'scan']
  },
  owner: {
    icon: '👑',
    label: 'المالك',
    cmds: ['ban', 'in', 'mode', 'broadcast', 'restart', 'disconnect', 'setprefix', 'setbotname', 'setbotpp', 'setmenuimage', 'anticall', 'autoreact', 'update', 'addblock', 'delblock', 'blocks', 'check', 'dailyreport', 'resetroles']
  },
  ai: {
    icon: '🤖',
    label: 'الذكاء الاصطناعي',
    cmds: ['ai', 'gptimage', 'imagine']
  },
  utility: {
    icon: '🔧',
    label: 'أدوات',
    cmds: ['translate', 'calc', 'weather']
  }
};

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'عرض جميع الأوامر المتاحة',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const prefix = config.prefix;

      const allCmds = Object.values(menuSections).reduce((acc, s) => acc.concat(s.cmds), []);
      const totalCount = allCmds.length;

      let menuText = `╭━━『 *${config.botName}* 』━━╮\n\n`;
      menuText += `👋 مرحبا @${extra.sender.split('@')[0]}!\n\n`;
      menuText += `⚡ البادئة: ${prefix}\n`;
      menuText += `📦 إجمالي الأوامر: ${totalCount}\n\n`;

      for (const [key, section] of Object.entries(menuSections)) {
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ ${section.icon} ${section.label}\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        section.cmds.forEach(cmd => {
          menuText += `│ ➜ ${prefix}${cmd}\n`;
        });
        menuText += `\n`;
      }

      menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
      menuText += `💡 اكتب ${prefix}help <command> لمزيد من المعلومات\n`;
      menuText += `🌟 إصدار البوت: 1.0.0\n`;

      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');

      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: menuText,
          mentions: [extra.sender]
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: menuText,
          mentions: [extra.sender]
        }, { quoted: msg });
      }
    } catch (error) {
      await extra.reply(`❌ خطأ: ${error.message}`);
    }
  }
};
