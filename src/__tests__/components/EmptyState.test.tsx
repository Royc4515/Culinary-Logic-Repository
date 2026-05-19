import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from '../../components/EmptyState';

describe('EmptyState', () => {
  it('renders "Nothing Found" heading', () => {
    render(<EmptyState />);
    expect(screen.getByText('Nothing Found')).toBeInTheDocument();
  });

  it('shows empty-repository message when no activeFilter and no searchQuery', () => {
    render(<EmptyState />);
    expect(
      screen.getByText(/Your repository is currently empty/i)
    ).toBeInTheDocument();
  });

  it('shows no-match message when activeFilter is set', () => {
    render(<EmptyState activeFilter="PLACE" />);
    expect(
      screen.getByText(/We couldn't find any culinary experiences/i)
    ).toBeInTheDocument();
  });

  it('shows no-match message when searchQuery is set', () => {
    render(<EmptyState searchQuery="sushi" />);
    expect(
      screen.getByText(/We couldn't find any culinary experiences/i)
    ).toBeInTheDocument();
  });

  it('does NOT show empty-repository message when activeFilter is set', () => {
    render(<EmptyState activeFilter="RECIPE" />);
    expect(
      screen.queryByText(/Your repository is currently empty/i)
    ).not.toBeInTheDocument();
  });

  it('shows "Clear Filters" button when activeFilter is set AND onClearFilter is provided', () => {
    const onClearFilter = vi.fn();
    render(<EmptyState activeFilter="PLACE" onClearFilter={onClearFilter} />);
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('calls onClearFilter once when "Clear Filters" button is clicked', () => {
    const onClearFilter = vi.fn();
    render(<EmptyState activeFilter="GEAR" onClearFilter={onClearFilter} />);
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onClearFilter).toHaveBeenCalledOnce();
  });

  it('does not show "Clear Filters" when activeFilter is set but no onClearFilter provided', () => {
    render(<EmptyState activeFilter="PLACE" />);
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it('does not show "Clear Filters" when no filter is active (even with handler)', () => {
    const onClearFilter = vi.fn();
    render(<EmptyState onClearFilter={onClearFilter} />);
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it('shows "Clear Filters" when only searchQuery is set and onClearFilter is provided', () => {
    const onClearFilter = vi.fn();
    render(<EmptyState searchQuery="pizza" onClearFilter={onClearFilter} />);
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('does not show "Clear Filters" when searchQuery is set but no onClearFilter', () => {
    render(<EmptyState searchQuery="pizza" />);
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });
});
