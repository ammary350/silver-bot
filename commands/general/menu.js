const menuChats = new Set();

const MAIN_MENU = `╭───『 HAWKS BOT 』───
│
├ ❯ 1. قسم الإدارة
├ ❯ 2. قسم الحماية
├ ❯ 3. الإعدادات العامة
├ ❯ 4. قسم الألعاب
├ ❯ 5. قسم التحميل
│
╰─────────────────────`;

const MENU_SECTIONS = {
  '1': `╭───『 قسم الإدارة 』───
│
├ ❯ .kick
├ ❯ .promote
├ ❯ .demote
├ ❯ .mute
├ ❯ .unmute
├ ❯ .warn
├ ❯ .resetwarn
├ ❯ .tagall
├ ❯ .hidetag
├ ❯ .antilink
├ ❯ .antitag
├ ❯ .antiacc
├ ❯ .welcome
├ ❯ .setwelcome
├ ❯ .goodbye
├ ❯ .setgoodbye
├ ❯ .clean
├ ❯ .delete
├ ❯ .grouplink
├ ❯ .ginfo
├ ❯ .setrules
├ ❯ .reqs
├ ❯ .approveall
├ ❯ .setreqmsg
├ ❯ .linksetup
├ ❯ .links
├ ❯ .linkhide
│
╰─────────────────────`,

  '2': `╭───『 قسم الحماية 』───
│
├ ❯ .detc
├ ❯ .antiword
├ ❯ .addword
├ ❯ .delword
├ ❯ .antispam
├ ❯ .spamlimit
├ ❯ .spamtime
├ ❯ .antidelete
├ ❯ .lock
├ ❯ .unlock
├ ❯ .panic
├ ❯ .rules
├ ❯ .scan
│
╰─────────────────────`,

  '3': `╭───『 الإعدادات 』───
│
├ [ عـام ]
├ ❯ .menu
├ ❯ .ping
├ ❯ .owner
├ ❯ .alive
├ ❯ .status
├ ❯ .uptime
├ ❯ .botstats
│
├ [ الرتب ]
├ ❯ .addadm
├ ❯ .deladm
├ ❯ .roles
│
├ [ المالك ]
├ ❯ .ban
├ ❯ .restart
├ ❯ .disconnect
├ ❯ .setprefix
├ ❯ .update
├ ❯ .blocks
│
├ [ الذكاء الاصطناعي ]
├ ❯ .ai
├ ❯ .imagine
│
╰─────────────────────`,

  '4': `╭───『 الألعاب 』───
│
├ ❯ .ابداء تفكيك [عدد]
├ ❯ .ابداء كتابة [عدد]
├ ❯ .ابداء احزر [عدد]
├ ❯ .ابداء المليون [عدد]
├ ❯ .xo (لعبة أكس أو)
│
╰─────────────────────`,

  '5': `╭───『 قسم التحميل 』───
│
├ ❯ .tiktok [الرابط]
├ ❯ .ig [الرابط]
├ ❯ .play [اسم الأغنية]
├ ❯ .edit [شخصية/موضوع]
├ ❯ .setdown (للمالك فقط)
│
╰─────────────────────`,
};

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'عرض جميع الأوامر المتاحة',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      menuChats.add(extra.from);
      await sock.sendMessage(extra.from, {
        text: MAIN_MENU,
      }, { quoted: msg });
    } catch (error) {
      await extra.reply(`خطأ: ${error.message}`);
    }
  },

  async handleMessage(sock, msg, body, extra) {
    if (!menuChats.has(extra.from) || !Object.prototype.hasOwnProperty.call(MENU_SECTIONS, body)) {
      return false;
    }

    menuChats.delete(extra.from);
    await sock.sendMessage(extra.from, {
      text: MENU_SECTIONS[body],
    }, { quoted: msg });
    return true;
  },

  isActiveMenu: (chat) => menuChats.has(chat),
};
