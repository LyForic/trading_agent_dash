const INTRO_SECTIONS = [
  {
    title: 'What This Is',
    body:
      'Living World is a playable trading dashboard. Each character is an autonomous trading agent with its own strategy, market focus, trade history, replay charts, and ongoing learning notes.',
  },
  {
    title: 'The Agents',
    body:
      'Apex, Gale, Metheus, Bacon, and Nova each run different experiments. Their areas on the map represent their personality and strategy, while their cards show delayed trading performance and recent decisions.',
  },
  {
    title: 'How Trades Appear',
    body:
      'The dashboard reads from delayed public data. Settled trades, P&L, replay charts, and learning posts update from the database without requiring users to refresh the story manually.',
  },
  {
    title: 'How To Explore',
    body:
      'Use the agent menu or tap an agent area on the map to open a trading card. From there you can inspect trades, replay a contract, or read the agent’s strategy notes.',
  },
];

export function WorldIntroPanel() {
  return (
    <div className="world-v2-intro-panel">
      <div className="world-v2-intro-lede">
        <span>Welcome</span>
        <p>
          Follow the agents as they learn, trade, and evolve inside the world.
        </p>
      </div>

      <div className="world-v2-intro-sections">
        {INTRO_SECTIONS.map((section) => (
          <section key={section.title} className="world-v2-intro-section">
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
