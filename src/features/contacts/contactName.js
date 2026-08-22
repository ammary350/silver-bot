/**
 * Contact name helpers — resolve push names / display names from the session store.
 */

const jidUtils = require('../../core/jid');

function getContactsMap(sock) {
  const contacts = sock?.store?.contacts;
  if (!contacts) return null;
  if (contacts instanceof Map) return contacts;
  if (typeof contacts === 'object') {
    // older Baileys object-style store
    return new Map(Object.entries(contacts));
  }
  return null;
}

/**
 * Get the best display name for a JID from saved contacts.
 * Prefers notify (push name), then name, then verifiedName.
 * Returns null when unknown.
 */
function getContactName(sock, jid) {
  if (!sock || !jid) return null;
  const contacts = getContactsMap(sock);
  if (!contacts) return null;

  const num = jidUtils.stripDevice(jid);
  let candidate = null;
  for (const [contactJid, contact] of contacts.entries()) {
    const contactNum = jidUtils.stripDevice(contactJid);
    if (!contactNum || contactNum !== num) continue;
    const name =
      (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) ? contact.notify.trim() :
      (contact.name && contact.name.trim() && !contact.name.match(/^\d+$/)) ? contact.name.trim() :
      (contact.verifiedName && contact.verifiedName.trim() && !contact.verifiedName.match(/^\d+$/)) ? contact.verifiedName.trim() :
      null;
    if (name) {
      if (!candidate || contactJid.includes('s.whatsapp.net')) {
        candidate = name;
      }
      if (contactJid.includes('s.whatsapp.net')) break;
    }
  }
  return candidate;
}

module.exports = { getContactName, getContactsMap };
