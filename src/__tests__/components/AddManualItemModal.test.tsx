import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock supabase to return null (mock data mode)
vi.mock('../../lib/supabase', () => ({
  supabase: null,
}));

import AddManualItemModal from '../../components/AddManualItemModal';
import type { CulinaryItem } from '../../data/mockData';

describe('AddManualItemModal', () => {
  const onClose = vi.fn();
  const onItemAdded = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose,
    onItemAdded,
  };

  beforeEach(() => {
    onClose.mockClear();
    onItemAdded.mockClear();
  });

  it('returns null / renders nothing when isOpen=false', () => {
    const { container } = render(
      <AddManualItemModal isOpen={false} onClose={onClose} onItemAdded={onItemAdded} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal form when isOpen=true', () => {
    render(<AddManualItemModal {...defaultProps} />);
    expect(screen.getByText('Add Item Manually')).toBeInTheDocument();
  });

  it('shows "Add Item Manually" heading', () => {
    render(<AddManualItemModal {...defaultProps} />);
    expect(screen.getByText('Add Item Manually')).toBeInTheDocument();
  });

  it('default type is PLACE → address field is visible', () => {
    render(<AddManualItemModal {...defaultProps} />);
    expect(screen.getByPlaceholderText('Full address')).toBeInTheDocument();
  });

  it('clicking RECIPE type button → hides address, shows prep/cook time fields', async () => {
    render(<AddManualItemModal {...defaultProps} />);
    const recipeBtn = screen.getByRole('button', { name: /^RECIPE$/i });
    await userEvent.click(recipeBtn);

    expect(screen.queryByPlaceholderText('Full address')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. 15/i)).toBeInTheDocument(); // Prep Time
    expect(screen.getByPlaceholderText(/e\.g\. 30/i)).toBeInTheDocument(); // Cook Time
  });

  it('clicking GEAR type button → shows brand/price fields', async () => {
    render(<AddManualItemModal {...defaultProps} />);
    const gearBtn = screen.getByRole('button', { name: /^GEAR$/i });
    await userEvent.click(gearBtn);

    expect(screen.queryByPlaceholderText('Full address')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. Vitamix/i)).toBeInTheDocument(); // Brand
    expect(screen.getByPlaceholderText(/e\.g\. \$400/i)).toBeInTheDocument(); // Price
  });

  it('submitting without a title shows error "Title is required"', () => {
    render(<AddManualItemModal {...defaultProps} />);
    // Use fireEvent.submit directly on the form so jsdom fires the onSubmit handler
    const form = document.getElementById('manual-add-form')!;
    fireEvent.submit(form);
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(onItemAdded).not.toHaveBeenCalled();
  });

  it('submitting with a title calls onItemAdded with object containing title and type', async () => {
    render(<AddManualItemModal {...defaultProps} />);

    const titleInput = screen.getByPlaceholderText(/Name of the place, recipe or gear/i);
    await userEvent.type(titleInput, 'My Test Restaurant');

    const submitBtn = screen.getByRole('button', { name: /Save Item/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(onItemAdded).toHaveBeenCalledOnce();
    });

    const calledWith = onItemAdded.mock.calls[0][0] as CulinaryItem;
    expect(calledWith.title).toBe('My Test Restaurant');
    expect(calledWith.type).toBe('PLACE');
  });

  it('submitting RECIPE type calls onItemAdded with type RECIPE', async () => {
    render(<AddManualItemModal {...defaultProps} />);

    const recipeBtn = screen.getByRole('button', { name: /^RECIPE$/i });
    await userEvent.click(recipeBtn);

    const titleInput = screen.getByPlaceholderText(/Name of the place, recipe or gear/i);
    await userEvent.type(titleInput, 'Carbonara');

    const submitBtn = screen.getByRole('button', { name: /Save Item/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(onItemAdded).toHaveBeenCalledOnce();
    });

    const calledWith = onItemAdded.mock.calls[0][0] as CulinaryItem;
    expect(calledWith.type).toBe('RECIPE');
    expect(calledWith.title).toBe('Carbonara');
  });

  it('cancel button calls onClose', async () => {
    render(<AddManualItemModal {...defaultProps} />);
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    await userEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not show error div when title is not empty on submit', async () => {
    render(<AddManualItemModal {...defaultProps} />);

    const titleInput = screen.getByPlaceholderText(/Name of the place, recipe or gear/i);
    await userEvent.type(titleInput, 'Valid Title');

    const submitBtn = screen.getByRole('button', { name: /Save Item/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
    });
  });

  it('switching type buttons highlights the active type', async () => {
    render(<AddManualItemModal {...defaultProps} />);

    const placeBtn = screen.getByRole('button', { name: /^PLACE$/i });
    const recipeBtn = screen.getByRole('button', { name: /^RECIPE$/i });

    // Initially PLACE is active
    expect(placeBtn.className).toContain('bg-stone-800');
    expect(recipeBtn.className).not.toContain('bg-stone-800');

    await userEvent.click(recipeBtn);

    expect(recipeBtn.className).toContain('bg-stone-800');
    expect(placeBtn.className).not.toContain('bg-stone-800');
  });
});
