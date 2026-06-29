# 🫀 High-Fidelity Clinical Patient Monitor Simulation
### *Because Flatlining is Only Fun in Movies!* 🎬💀

Welcome to the **High-Fidelity Clinical Patient Monitor Simulation**! This is not your average, boring browser toy. We’ve thrown out the basic symmetric sine waves and replaced them with **calibrated biomedical physics and mathematics**. 

Whether you want to simulate a healthy jogger, a patient in deep trouble, or go full "chaos mode" as a clinical instructor triggering PVCs (Premature Ventricular Contractions), this monitor has you covered.

---

## ⚡ Key Highlights (Or: Why This is Cool)

*   **No Sine-sation Here:** Real heartbeats are complex. That's why we use multi-component Gaussian models. The curves look exactly like the ones on a real hospital GE/Philips monitor!
*   **Pulse Propagation Latency:** Blood isn't instantaneous! We’ve hardcoded a dynamic **150ms delay** between the electrical R-spike (ECG) and the physical blood pressure waves (ABP, SpO2, PAP). If your heart beats, the pulse wave takes actual time to travel down the arterial highway.
*   **Audio Synesthesia (Web Audio API):** Hear the heartbeat beep pitch change dynamically with the patient's $SpO_2$ percentage. If $SpO_2$ drops, the pitch slides down! 📉 If the patient flatlines or goes into red alert, prepare your ears for some authentic hospital alarm panic.
*   **Instructor Chaos Console:** Take control of the dials. Push the heart rate to 220, crash the oxygen saturation to 50%, turn up the muscular noise (ECG artifacts) to 100%, or trigger a PVC right in the middle of a rhythm.

---

## 📐 The Math (For the Science Geeks 🤓)

Most simulators cheat. They use `Math.sin()`. We chose violence (and mathematics):

### 1. 🟢 ECG Waveform (The McSharry Gaussian Model)
We map the cycle phase to an angular $\theta \in [-\pi, \pi]$ and compute the sum of five Gaussian waveforms (P, Q, R, S, T):
$$ECG(\theta) = \sum_{i} a_i \exp\left(-\frac{(\theta - \theta_i)^2}{2 b_i^2}\right)$$
We strictly enforce the physiological widths ($b$) and peaks ($a$) to make sure your P-wave is gentle, your QRS complex is sharp enough to cut glass, and the T-wave is organically broad.

### 2. 🟡 SpO2 PLETH Waveform (2-Component Gaussian)
Instead of a simple ramp, we sum two Gaussians to model the rapid systolic ejection phase and the elastic recoil (the dicrotic notch):
$$PLETH(t) = A_1 \exp\left(-\frac{(t - t_1)^2}{2 g_1^2}\right) + A_2 \exp\left(-\frac{(t - t_2)^2}{2 g_2^2}\right)$$
*   **Component 1 (Systolic Peak):** $A_1 = 1.0, t_1 = 0.2, g_1 = 0.08$
*   **Component 2 (Dicrotic Notch):** $A_2 = 0.35, t_2 = 0.45, g_2 = 0.15$

---

## 🎮 The Instructor Panel: Be the Puppet Master

Down at the bottom is your control panel. Use it to cause or cure emergencies:

1.  **Normal Sinus Rhythm:** The patient is chill. Everything is fine.
2.  **Tachycardia & Hypertension:** The patient ran a marathon (or saw their credit card bill). High heart rate, high blood pressure.
3.  **Bradycardia & Hypotension:** Deep sleep or shock. Low heart rate, low blood pressure.
4.  **Severe Hypoxia:** Oxygen is crashing, alarms are screaming, the beep tone pitch slides into a gloomy low frequency.
5.  **Cardiac Arrest (Asystole):** The dreaded flatline. 💀 Systemic arterial pressure decays to a static compliance floor (mean systemic filling pressure of $\approx 8\text{ mmHg}$).

---

## 🛠️ Built With

*   **HTML5 & CSS3:** With custom CRT glassmorphism scanlines and neon glowing dropshadows.
*   **Vanilla JS:** No framework bloat. Pure math running at a solid **25Hz (40ms ticks)**.
*   **Smoothie.js:** A fantastic real-time data streaming chart library that handles high-fidelity updates like a champ.
*   **Web Audio API:** Creating sound frequencies on the fly. No audio file downloads required.

---

## 🚀 Quick Start (Let's Get Simulating!)

1.  Start a local HTTP server in this directory:
    ```bash
    python -m http.server 8000
    ```
2.  Open your browser to:
    [http://localhost:8000](http://localhost:8000)
3.  **TURN ON AUDIO:** Click the **`🔇 ALARM MUTED`** button in the top left of the monitor screen to enable real-time auditory feedback!
4.  Play with the sliders and presets to see how the mathematical waveforms adjust dynamically.

*Warning: Antigravity-IDE is not responsible for any simulated cardiac flatlines or temporary panic induced by the alarm audio.* 😉
