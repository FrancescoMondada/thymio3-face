import React from 'react';

// If something goes wrong the screen must not just go blank: a message and a button that loads the
// page again. The details are in the console.
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error, info) {
    console.error('[face] the interface failed', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <button type="button" className="big-button" onClick={() => window.location.reload()}>↻</button>
      </div>
    );
  }
}
