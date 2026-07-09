import ChatClient from './components/ChatClient';

export default function HomePage() {
  return (
    <main>
      <h1>Phaseo Gateway Web Chat Example</h1>
      <p className="muted">
        Minimal API-key integration using model discovery + Responses API.
      </p>
      <ChatClient />
    </main>
  );
}
