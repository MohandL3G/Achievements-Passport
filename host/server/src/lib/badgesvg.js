const { escapeXml } = require('../utils');

function statCell(x, label, value) {
  return `
      <g>
        <text x="${x}" y="52" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#8b949e" letter-spacing="1">${escapeXml(label)}</text>
        <text x="${x}" y="70" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="bold" fill="#f0f6fc">${escapeXml(value)}</text>
      </g>`;
}

function renderBadge(card, steamid) {
  const s = card ? card.Summary : null;
  const persona = card && card.Player ? card.Player.PersonaName : `Steam ${steamid}`;

  let body;
  if (!s) {
    body = `
      <text x="170" y="60" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#8b949e">No card generated yet</text>`;
  } else {
    const hours = Math.floor((s.TotalPlaytimeMinutes || 0) / 60);
    const ach = `${s.TotalAchievementsUnlocked || 0}/${s.TotalAchievements || 0}`;
    body = `
      <text x="170" y="24" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#e3b341" letter-spacing="2">ACHIEVEMENTS PASSPORT</text>
      <text x="170" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#f0f6fc">${escapeXml(persona)}</text>
      ${statCell(55, 'GAMES', String(s.TotalGames || 0))}
      ${statCell(138, 'PERFECT', String(s.PerfectGames || 0))}
      ${statCell(222, 'COMPLETION', `${(s.CompletionPercentage || 0)}%`)}
      ${statCell(300, 'PLAYTIME', `${hours}h`)}`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="100" viewBox="0 0 340 100" role="img" aria-label="Achievements Passport for ${escapeXml(persona)}">
  <rect width="340" height="100" rx="12" fill="#0d1117"/>
  <rect width="340" height="4" rx="2" fill="#e3b341"/>
  ${body}
</svg>
`;
}

module.exports = { renderBadge };