import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// vi.mock is hoisted — use vi.fn() inside; access the mock via the imported module below
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
    },
  },
}));

import AuthScreen from '../../components/AuthScreen';
import { supabase } from '../../lib/supabase';

describe('AuthScreen', () => {
  const mockSignInWithOAuth = vi.mocked(supabase!.auth.signInWithOAuth);

  beforeEach(() => {
    mockSignInWithOAuth.mockClear();
    // Default: successful OAuth response
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/auth?...' },
      error: null,
    });

    // Mock window.open
    vi.stubGlobal('open', vi.fn().mockReturnValue({
      closed: false,
      focus: vi.fn(),
    }));

    // Mock window.location.origin
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000' },
      writable: true,
      configurable: true,
    });
  });

  it('renders "CLR." heading', () => {
    render(<AuthScreen />);
    // The heading is "CLR" with a styled dot after
    expect(screen.getByText(/CLR/i)).toBeInTheDocument();
  });

  it('renders "Continue with Google" button', () => {
    render(<AuthScreen />);
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it('shows "Connecting..." while OAuth is in progress (button disabled during loading)', async () => {
    // Make signInWithOAuth hang until we resolve
    let resolveOAuth!: (v: any) => void;
    mockSignInWithOAuth.mockReturnValue(
      new Promise((resolve) => { resolveOAuth = resolve; })
    );

    render(<AuthScreen />);
    const button = screen.getByRole('button', { name: /Continue with Google/i });
    await userEvent.click(button);

    // While pending, button should show "Connecting..."
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Connecting\.\.\./i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Connecting\.\.\./i })).toBeDisabled();

    // Resolve the OAuth promise
    resolveOAuth({ data: { url: 'https://accounts.google.com' }, error: null });
  });

  it('renders error message when signInWithOAuth fails', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: null,
      error: { message: 'OAuth provider error' },
    });

    render(<AuthScreen />);
    const button = screen.getByRole('button', { name: /Continue with Google/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('OAuth provider error')).toBeInTheDocument();
    });
  });

  it('calls window.open when signInWithOAuth returns a URL', async () => {
    render(<AuthScreen />);
    const button = screen.getByRole('button', { name: /Continue with Google/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/auth?...',
        'oauth_popup',
        expect.stringContaining('width=600')
      );
    });
  });

  it('does not call window.open when no URL in response', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: null,
    });

    render(<AuthScreen />);
    const button = screen.getByRole('button', { name: /Continue with Google/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(window.open).not.toHaveBeenCalled();
    });
  });

  it('shows popup-blocked error when window.open returns null', async () => {
    vi.stubGlobal('open', vi.fn().mockReturnValue(null));

    render(<AuthScreen />);
    const button = screen.getByRole('button', { name: /Continue with Google/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Please allow popups/i)).toBeInTheDocument();
    });
  });

  it('renders subtitle text about authentication requirement', () => {
    render(<AuthScreen />);
    expect(screen.getByText(/You must authenticate/i)).toBeInTheDocument();
  });

  it('button is not disabled initially', () => {
    render(<AuthScreen />);
    const button = screen.getByRole('button', { name: /Continue with Google/i });
    expect(button).not.toBeDisabled();
  });
});
