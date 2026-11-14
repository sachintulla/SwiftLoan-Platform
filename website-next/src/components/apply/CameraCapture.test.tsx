// @vitest-environment jsdom
// The website's "Take a photo" window for the PAN card: it must say why when the camera can't be used
// (refused / none), never show a blank window, and only allow Capture once the picture is live.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { CameraCapture, type CameraCaptureCopy } from './CameraCapture';

const copy: CameraCaptureCopy = {
  title: 'Take a photo of your PAN card', hint: 'hint', capture: 'Capture', cancel: 'Cancel',
  starting: 'Starting the camera…', denied: 'Camera access is blocked.', unavailable: 'No camera was found.',
};
const setMedia = (getUserMedia: unknown) =>
  Object.defineProperty(navigator, 'mediaDevices', { value: getUserMedia ? { getUserMedia } : undefined, configurable: true });
const show = () => render(<CameraCapture open onClose={() => {}} onCapture={() => {}} copy={copy} />);
const captureBtn = () => screen.getByRole('button', { name: /Capture/ }) as HTMLButtonElement;

describe('CameraCapture', () => {
  afterEach(() => { cleanup(); setMedia(null); });

  it('renders nothing while closed (and never touches the camera)', () => {
    const gum = vi.fn();
    setMedia(gum);
    const { container } = render(<CameraCapture open={false} onClose={() => {}} onCapture={() => {}} copy={copy} />);
    expect(container.firstChild).toBeNull();
    expect(gum).not.toHaveBeenCalled();
  });

  it('says so when the browser has no camera support', async () => {
    setMedia(null);
    show();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(copy.unavailable));
    expect(captureBtn().disabled).toBe(true);
  });

  it('says access is blocked when the visitor (or the browser) refuses', async () => {
    setMedia(vi.fn().mockRejectedValue(Object.assign(new Error('no'), { name: 'NotAllowedError' })));
    show();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(copy.denied));
    expect(captureBtn().disabled).toBe(true);
  });

  it('says no camera when the device has none', async () => {
    setMedia(vi.fn().mockRejectedValue(Object.assign(new Error('none'), { name: 'NotFoundError' })));
    show();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(copy.unavailable));
  });

  it('asks for the rear camera, enables Capture once live, and stops the camera on close', async () => {
    const stopTrack = vi.fn();
    const gum = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    setMedia(gum);
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    const { unmount } = show();
    await waitFor(() => expect(captureBtn().disabled).toBe(false));
    expect(gum).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) }));
    unmount();
    expect(stopTrack).toHaveBeenCalled();
  });
});
