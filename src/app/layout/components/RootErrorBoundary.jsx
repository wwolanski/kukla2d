import { AlertTriangle, RotateCcw, Download } from 'lucide-react';
import PropTypes from 'prop-types';
import { Component } from 'react';

import { readRecovery } from '@/io/projectDb.js';

import { Button } from '@/components/ui/button.jsx';

export class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, recoveryArchive: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[RootErrorBoundary] React render error:', error, errorInfo);
    readRecovery().then((record) => {
      this.setState({ recoveryArchive: record?.archive ?? null });
    }).catch((recoveryError) => {
      console.error('[RootErrorBoundary] Failed to read recovery:', recoveryError);
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDownloadRecovery = () => {
    const { recoveryArchive } = this.state;
    if (!recoveryArchive) return;
    const url = URL.createObjectURL(recoveryArchive);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recovery.kk2d';
    a.click();
    URL.revokeObjectURL(url);
  };

  render() {
    if (this.state.error) {
      const { recoveryArchive } = this.state;
      return (
        <div
          className="flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground"
          data-root-error-boundary="true"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-semibold">
                Application error
              </h1>
              <p className="text-sm text-muted-foreground">
                Something went wrong while rendering the application.
                Your project data is preserved in memory.
              </p>
            </div>

            <div className="flex gap-2">
              {recoveryArchive && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={this.handleDownloadRecovery}
                  data-root-download-recovery="true"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Download recovery
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={this.handleReload}
                data-root-reload="true"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Reload application
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground/60">
              Kukla2D {__APP_VERSION__}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

RootErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};
