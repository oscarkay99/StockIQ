import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel px-5 py-6 flex items-start gap-4">
          <div className="w-9 h-9 rounded-lg bg-loss/10 border border-loss/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={16} className="text-loss" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-t1 mb-1">Something went wrong loading this section</div>
            <p className="text-xs text-t3 font-mono mb-3 break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="btn-ghost text-xs gap-1.5"
            >
              <RefreshCw size={11} /> Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
