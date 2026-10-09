/**
 * Shown instead of the app on a browser that lacks something it needs, so the
 * person gets an explanation rather than a half-drawn screen. Nothing has been
 * read from or written to their data.
 */
export function UnsupportedBrowser({ reasons }: { reasons: string[] }) {
  return (
    <div className="app">
      <main className="app-main">
        <div className="empty" role="alert">
          <div className="empty-icon">⚠️</div>
          <h3>Trana needs a newer browser</h3>
          <p className="muted">This browser can’t run Trana: {reasons.join('; ')}.</p>
          <p className="muted">
            It works on iPhone and iPad with iOS 16.2 or later (Safari), and on current Chrome, Edge and Firefox (Chrome
            and Edge 111+, Firefox 113+). Updating your browser or operating system should fix it. Any workouts already
            saved on this device have not been touched.
          </p>
        </div>
      </main>
    </div>
  )
}
