/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['212750038790'],
    ownerName: ['Silver Bot Owner'],
    
    // Bot Configuration
    botName: 'ᎻᎯᏯᏦᏕ ᏰᎾᎿ',
    prefix: '.',
    sessionName: 'session',
    sessionID: process.env.SESSION_ID || '',
    updateZipUrl: '', // URL to your GitHub repo ZIP for .update command (e.g., https://github.com/yourusername/your-repo/archive/refs/heads/main.zip)
    
    // Sticker Configuration
    packname: 'Silver Bot',
    
    // Bot Behavior
    selfMode: true, // Private mode - only role-holders (Owner/Co-owner/Admin) can use commands
    autoRead: false,
    autoTyping: false,
    autoBio: false,
    autoSticker: false,
    autoReact: false,
    autoReactMode: 'bot', // set bot or all via cmd
    autoDownload: false,
    
    // Block Control (automatic phone-number blocklisting)
    // Country rules used to validate detected numbers (e.g. '212' for Morocco)
    blockControlCountryCode: '212',
    
    // Group Settings Defaults
    defaultGroupSettings: {
      antilink: false,
      antilinkAction: 'delete',
      antitag: false,
      antitagAction: 'delete',
      antiall: false,
      mute: false,
      antiviewonce: false,
      antibot: false,
      anticall: true,
      antispam: false,
      spamlimit: 3,
      spamtime: 4000,
      antiword: false,
      lock: false,
      welcome: false,
      welcomeMessage: 'Welcome @user! 🎉\n\nEnjoy your stay in @group.\n\n> *Silver Bot*',
      goodbye: false,
      goodbyeMessage: 'Goodbye @user 👋',
      joinrules: false,
      joinrulesMessage: 'Welcome! Please read the group rules:\n1. Respect all members\n2. No spamming\n3. Follow admin instructions\n\n> *Silver Bot*',
      autosticker: false,
      detc: false,
      antiacc: false,
      antidelete: false,
      antideleteAction: 'log'
    },
    
    // Author for sticker metadata (used in sticker commands)
    author: 'Silver Bot',
    
    // API Keys (add your own)
    apiKeys: {
      // Add API keys here if needed
      openai: '',
      deepai: '',
      remove_bg: ''
    },
    
    // Message Configuration
    messages: {
      wait: '⏳ Please wait...',
      success: '✅ Success!',
      error: '❌ Error occurred!',
      ownerOnly: '👑 This command is only for bot owner!',
      adminOnly: '🛡️ This command is only for group admins!',
      groupOnly: '👥 This command can only be used in groups!',
      privateOnly: '💬 This command can only be used in private chat!',
      botAdminNeeded: '🤖 Bot needs to be admin to execute this command!',
      invalidCommand: '❓ Invalid command! Type .menu for help'
    },
    
    // Timezone
    timezone: 'Asia/Kolkata',
    
    // Limits
    maxWarnings: 3,
    
    // Social Links (optional - configure your own)
    social: {
      github: '',
      instagram: '',
      youtube: ''
    }
};
