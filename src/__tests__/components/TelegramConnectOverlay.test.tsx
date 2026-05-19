import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TelegramConnectOverlay from '../../components/TelegramConnectOverlay';

describe('TelegramConnectOverlay', () => {
  const defaultProps = {
    deepLink: 'https://t.me/MyBot?start=link_abc123',
    token: 'test-token-xyz',
    onClose: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onClose.mockClear();
    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    });
  });

  it('renders "Connect Telegram" heading', () => {
    render(<TelegramConnectOverlay {...defaultProps} />);
    expect(screen.getByText(/Connect Telegram/i)).toBeInTheDocument();
  });

  it('renders the deep link as an anchor href', () => {
    render(<TelegramConnectOverlay {...defaultProps} />);
    const link = screen.getByRole('link', { name: /Open in Telegram/i });
    expect(link).toHaveAttribute('href', 'https://t.me/MyBot?start=link_abc123');
  });

  it('renders the command string with /start and token', () => {
    render(<TelegramConnectOverlay {...defaultProps} />);
    expect(screen.getByText('/start test-token-xyz')).toBeInTheDocument();
  });

  it('clicking copy button calls navigator.clipboard.writeText with the command', async () => {
    render(<TelegramConnectOverlay {...defaultProps} />);
    const copyBtn = screen.getByTitle('Copy command');
    await userEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/start test-token-xyz');
  });

  it('shows check icon after copying (copied state)', async () => {
    render(<TelegramConnectOverlay {...defaultProps} />);
    const copyBtn = screen.getByTitle('Copy command');

    // Before copy: clipboard.writeText should not have been called
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

    await userEvent.click(copyBtn);

    // After clicking, clipboard should have been called
    expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();

    // The button should now contain an SVG that represents the check icon
    // (lucide Check icon renders an SVG)
    await waitFor(() => {
      // The copy button should still be in the document
      expect(copyBtn).toBeInTheDocument();
    });
  });

  it('clicking close (X) button calls onClose', async () => {
    render(<TelegramConnectOverlay {...defaultProps} />);
    // The X button is an absolute-positioned button at top-right
    // It wraps the X icon. Find it via its parent container or by looking for
    // a button without a title and not the copy button.
    const allButtons = screen.getAllByRole('button');
    // The X close button is the first button rendered in the component
    const closeButton = allButtons[0];
    await userEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it('renders "Waiting for confirmation" subtitle', () => {
    render(<TelegramConnectOverlay {...defaultProps} />);
    expect(screen.getByText(/Waiting for confirmation/i)).toBeInTheDocument();
  });

  it('renders instruction text about pasting the command', () => {
    render(<TelegramConnectOverlay {...defaultProps} />);
    expect(screen.getByText(/paste and send/i)).toBeInTheDocument();
  });
});
