import { BookOpen, Bot, Compass, FlaskConical, ReceiptText, Tv, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

interface Props {
  onStart: () => void;
  onOpenLab: () => void;
}

interface IntroStep {
  label: string;
  title: string;
  body: string;
  Icon: LucideIcon;
}

const INTRO_STEPS: IntroStep[] = [
  {
    label: 'Agents',
    title: 'Agents',
    body: 'Each character is an autonomous agent with its own strategy and performance. Tap one to inspect what happened today.',
    Icon: Bot,
  },
  {
    label: 'Proof',
    title: 'Proof',
    body: 'Trade replays show the contract, entry, settlement, and P&L so the video claims can be checked.',
    Icon: ReceiptText,
  },
  {
    label: 'Lessons',
    title: 'Lessons',
    body: 'Field notes explain wins, losses, mistakes, risk, and what the agent is watching next.',
    Icon: BookOpen,
  },
  {
    label: 'Daily Lab',
    title: 'Daily Lab',
    body: "Open the flask for today's scoreboard. Open the TV for the latest short. Come back tomorrow to see what changed.",
    Icon: FlaskConical,
  },
];

export function WorldIntroPanel({ onStart, onOpenLab }: Props) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStep = INTRO_STEPS[activeStepIndex];
  const ActiveIcon = activeStep.Icon;

  return (
    <div className="world-v2-intro-panel">
      <div className="world-v2-intro-stepper" role="tablist" aria-label="Gym Live guide steps">
        {INTRO_STEPS.map((step, index) => {
          const StepIcon = step.Icon;
          const active = index === activeStepIndex;
          return (
            <button
              key={step.label}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? 'world-v2-intro-step world-v2-intro-step--active' : 'world-v2-intro-step'}
              onClick={() => setActiveStepIndex(index)}
            >
              <StepIcon size={15} aria-hidden />
              <span>{step.label}</span>
            </button>
          );
        })}
      </div>

      <article className="world-v2-intro-stage" aria-live="polite">
        <div className="world-v2-intro-stage__icon">
          <ActiveIcon size={22} aria-hidden />
        </div>
        <div>
          <span>Step {activeStepIndex + 1} of {INTRO_STEPS.length}</span>
          <h3>{activeStep.title}</h3>
          <p>{activeStep.body}</p>
        </div>
      </article>

      <div className="world-v2-intro-rail" aria-label="Key controls">
        <div>
          <Bot size={15} aria-hidden />
          <span>Agent tray</span>
        </div>
        <div>
          <FlaskConical size={15} aria-hidden />
          <span>Public Lab</span>
        </div>
        <div>
          <Tv size={15} aria-hidden />
          <span>Latest short</span>
        </div>
        <div>
          <BookOpen size={15} aria-hidden />
          <span>Notes and replays</span>
        </div>
      </div>

      <div className="world-v2-intro-actions">
        <button type="button" className="world-v2-intro-primary" onClick={onStart}>
          <Compass size={16} aria-hidden />
          <span>Start exploring</span>
        </button>
        <button type="button" className="world-v2-intro-secondary" onClick={onOpenLab}>
          <FlaskConical size={16} aria-hidden />
          <span>Open Public Lab</span>
        </button>
      </div>
    </div>
  );
}
