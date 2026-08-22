/**
 * Owner Command - Sends bot owner's contact card (vCard)
 * Owner numbers are never shown as plain text outside this command.
 */

const config = require('../../config');
const database = require('../../database');

module.exports = {
    name: 'owner',
    aliases: ['creator', 'dev', 'botowner'],
    category: 'general',
    description: 'Show bot owner contact information',
    usage: '.owner',
    ownerOnly: false,

    async execute(sock, msg, args, extra) {
        try {
            const chatId = extra.from;

            // Owner records from config — names preserved where available
            const ownerNumbers = Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber];
            const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];

            // Normalize numbers; skip malformed entries safely
            const validOwners = ownerNumbers
                .map((num, index) => ({
                    number: database.normalizeNumber(num),
                    name: (ownerNames[index] || ownerNames[0] || 'Bot Owner').trim()
                }))
                .filter(entry => /^\d{7,15}$/.test(entry.number));

            if (!validOwners.length) {
                return extra.reply('❌ No owner contact configured.');
            }

            const vCards = validOwners.map(entry => ({
                vcard: [
                    'BEGIN:VCARD',
                    'VERSION:3.0',
                    `FN:${entry.name}`,
                    `TEL;waid=${entry.number}:${entry.number}`,
                    'END:VCARD'
                ].join('\n')
            }));

            const displayName = validOwners[0].name;

            await sock.sendMessage(chatId, {
                contacts: {
                    displayName,
                    contacts: vCards
                }
            });

            await extra.reply('👑 Here is the contact of my *Owner*.');

        } catch (error) {
            console.error('Owner command error:', error);
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};