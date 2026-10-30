"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand, Arrow } from "../components/brand";
export default function Home() {
  const router = useRouter();
  return (
    <>
      <header className="public-nav wrap">
        <Brand />
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#examples">Examples</a>
          <Link href="/sign-in">Sign in</Link>
          <Link className="button small" href="/create-account">
            Get started <Arrow />
          </Link>
        </nav>
      </header>
      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <span className="eyebrow">
              <i /> YOUR IDEAS. BEAUTIFULLY EXPLAINED.
            </span>
            <h1>
              Turn your ideas into videos that <em>explain.</em>
            </h1>
            <p className="lead">
              A thought. A question. A little curiosity.
              <br />
              Bring it to life with Hindi & Hinglish voice and meaningful motion
              graphics.
            </p>
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                sessionStorage.setItem(
                  "newbert-topic",
                  JSON.stringify({
                    topic: f.get("topic"),
                    language: f.get("language"),
                  }),
                );
                router.push("/sign-in?next=/app/create");
              }}
            >
              <label htmlFor="topic">What do you want to explain?</label>
              <textarea
                id="topic"
                name="topic"
                required
                maxLength={2000}
                placeholder="Why do we feel like everyone is watching us?"
              />
              <div className="composer-bottom">
                <select name="language" aria-label="Video language">
                  <option>Hinglish</option>
                  <option>Hindi</option>
                </select>
                <button>
                  Start with an idea <Arrow />
                </button>
              </div>
            </form>
            <p className="fine">
              Limited free pilot · Your own workspace · No recording needed
            </p>
          </div>
          <div className="hero-visual">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <div className="video-card">
              <div className="video-label">
                <span className="mint-dot" /> AN IDEA, IN MOTION{" "}
                <span>00:39</span>
              </div>
              <video
                controls
                playsInline
                preload="metadata"
                poster="/examples/psychology.jpg"
                aria-label="Hindi spotlight effect video example"
              >
                <source src="/examples/psychology.mp4" type="video/mp4" />
              </video>
              <div className="video-caption">
                <span>THE SPOTLIGHT EFFECT</span>
                <p>सबकी नज़र आप पर है… या ऐसा लगता है?</p>
              </div>
            </div>
            <span className="floating-note">✦ Made to make sense.</span>
          </div>
        </section>
        <section id="how" className="section wrap">
          <span className="eyebrow">FROM CURIOSITY TO CLARITY</span>
          <h2>One idea. A clear path.</h2>
          <p className="muted">
            A focused workflow, built around the story you want to tell.
          </p>
          <div className="steps">
            {[
              "Your topic",
              "Clear script",
              "Natural voice",
              "Motion graphics",
              "Your video",
            ].map((s, i) => (
              <div key={s}>
                <span className="step-number">0{i + 1}</span>
                <h3>{s}</h3>
                <p>
                  {
                    [
                      "Start with something worth explaining.",
                      "Shape the explanation before production.",
                      "Hindi and Hinglish narration.",
                      "Visuals that support every point.",
                      "Preview first. Share when ready.",
                    ][i]
                  }
                </p>
              </div>
            ))}
          </div>
        </section>
        <section id="examples" className="section wrap">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SMALL VIDEOS. BIG UNDERSTANDING.</span>
              <h2>See an idea come alive.</h2>
            </div>
            <span className="pill">Actual early video examples</span>
          </div>
          <div className="example-grid">
            <article className="panel example">
              <span className="tag">PSYCHOLOGY · HINDI · 39 SEC</span>
              <h3>Why everyone seems to be watching you</h3>
              <p>The spotlight effect, explained with light and motion.</p>
              <a href="/examples/psychology.mp4">Watch example ↗</a>
            </article>
            <article className="panel example">
              <span className="tag">TECHNOLOGY · HINGLISH · 21 SEC</span>
              <h3>How computers understand binary</h3>
              <p>A simple explanation, one bit at a time.</p>
              <video
                controls
                playsInline
                preload="none"
                poster="/examples/binary.jpg"
                aria-label="Hinglish binary video example"
                src="/examples/binary.mp4"
              />
            </article>
          </div>
          <p className="fine">
            Early feasibility examples. Narration generated with ElevenLabs.
            Voice and output use depend on provider terms.
          </p>
        </section>
        <section className="section wrap benefits">
          <div>
            <span className="eyebrow">EXPLAIN MORE. JUGGLE LESS.</span>
            <h2>
              A studio built
              <br />
              for curious minds.
            </h2>
          </div>
          <div>
            {[
              [
                "Your language, your audience",
                "Start in Hindi or Hinglish, with typography that respects both.",
              ],
              [
                "Visuals with a purpose",
                "Diagrams and motion that make an explanation easier to follow.",
              ],
              [
                "One personal space",
                "Your ideas and progress belong in your private workspace.",
              ],
            ].map(([h, p]) => (
              <article key={h}>
                <span>✦</span>
                <div>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="section wrap faq">
          <span className="eyebrow">A FEW THINGS TO KNOW</span>
          <h2>Before your first idea.</h2>
          {[
            [
              "Is Newbert ready to generate videos?",
              "We are building in stages. Accounts, saved projects and the planning queue are available now. Automated scripting, voice and rendering are still being built. The videos above are early examples.",
            ],
            [
              "Will it be free?",
              "The plan is a limited free pilot with allowances and a waiting queue. Final limits will follow measured processing costs.",
            ],
            [
              "Can it post to Instagram?",
              "Instagram connection and scheduling are planned. They are not available in this release.",
            ],
            [
              "Do I need to record my voice?",
              "The planned workflow uses generated narration. Voice eligibility and provider allowances will be shown before generation.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="closing wrap">
          <span className="eyebrow">LET CURIOSITY LEAD.</span>
          <h2>
            Your next explanation
            <br />
            starts with an idea.
          </h2>
          <Link className="button" href="/create-account">
            Create your workspace <Arrow />
          </Link>
        </section>
      </main>
      <footer className="wrap footer">
        <Brand />
        <p>Made for ideas worth understanding.</p>
        <span>Early development · 2026</span>
      </footer>
    </>
  );
}
