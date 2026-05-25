const INTRO_SECTIONS = [
  {
    title: 'What This Is',
    body:
      'Gym Life Fork is the public proof layer for Brandon’s daily agent experiment: real agents, real trades, delayed proof, and notes on what changed.',
  },
  {
    title: 'The Agents',
    body:
      'Apex, Metheus, Bacon, and Nova are the public trading cast. Gale is still in weather-market testing until Brandon promotes that agent publicly.',
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
          Follow @brandonnfongg and come back tomorrow to see what the agents did, what they learned, and what changed.
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
