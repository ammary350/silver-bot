const fs = require('fs');
const path = require('path');

const statsPath = path.join(__dirname, '..', '..', 'data', 'groupStats.json');

const ensureStatsFile = () => {
  if (!fs.existsSync(statsPath)) {
    fs.writeFileSync(statsPath, JSON.stringify({}), 'utf-8');
  }
};

const loadStats = () => {
  ensureStatsFile();
  try {
    return JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
  } catch {
    return {};
  }
};

const saveStats = (data) => {
  ensureStatsFile();
  fs.writeFileSync(statsPath, JSON.stringify(data, null, 2), 'utf-8');
};

const getToday = () => {
  return new Date().toISOString().slice(0, 10);
};

const addMessage = (groupId, userId) => {
  const data = loadStats();
  const today = getToday();
  if (!data[groupId]) data[groupId] = {};
  if (!data[groupId][today]) data[groupId][today] = { total: 0, users: {} };
  data[groupId][today].total += 1;
  if (!data[groupId][today].users[userId]) data[groupId][today].users[userId] = 0;
  data[groupId][today].users[userId] += 1;
  saveStats(data);
};

const getStats = (groupId) => {
  const data = loadStats();
  const today = getToday();
  if (!data[groupId] || !data[groupId][today]) return null;
  return data[groupId][today];
};

const getAllStats = (groupId) => {
  const data = loadStats();
  return data[groupId] || {};
};

const resetStats = (groupId) => {
  const data = loadStats();
  const today = getToday();
  if (data[groupId] && data[groupId][today]) {
    delete data[groupId][today];
    saveStats(data);
    return true;
  }
  return false;
};

module.exports = {
  addMessage,
  getStats,
  getAllStats,
  resetStats
};