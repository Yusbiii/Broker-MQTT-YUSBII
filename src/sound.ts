// Simple Web Audio API beep manager to play the warning sound when temperature threshold is exceeded.

let audioCtx: AudioContext | null = null;

export function playBeepAlert() {
  try {
    // Initialize AudioContext on first user interaction if browser blocked it
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High alarm frequency: A5 note (880Hz)
    
    // Create a pulsing pattern: beep - silence - beep
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime + 0.15);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (error) {
    console.warn('Gagal memainkan suara alert:', error);
  }
}
