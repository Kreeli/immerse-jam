package app.immersejam.mobile.inference;

public final class SignalMath {
  private SignalMath() {}

  public static void fft(double[] real, double[] imag, boolean inverse) {
    int n = real.length;
    if ((n & (n - 1)) != 0) {
      if (n % 3 != 0) throw new IllegalArgumentException("Unsupported FFT size");
      int size = n / 3;
      double[][] r = new double[3][size], im = new double[3][size];
      for (int j = 0; j < 3; j++) {
        for (int k = 0; k < size; k++) {
          r[j][k] = real[3 * k + j];
          im[j][k] = imag[3 * k + j];
        }
        fft(r[j], im[j], inverse);
      }
      double direction = inverse ? 1 : -1;
      for (int k = 0; k < n; k++) {
        double re = 0, in = 0;
        for (int j = 0; j < 3; j++) {
          double angle = direction * 2 * Math.PI * j * k / n,
              c = Math.cos(angle),
              s = Math.sin(angle);
          re += r[j][k % size] * c - im[j][k % size] * s;
          in += r[j][k % size] * s + im[j][k % size] * c;
        }
        real[k] = re / (inverse ? 3 : 1);
        imag[k] = in / (inverse ? 3 : 1);
      }
      return;
    }
    for (int i = 1, j = 0; i < n; i++) {
      int bit = n >> 1;
      for (; (j & bit) != 0; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        double v = real[i];
        real[i] = real[j];
        real[j] = v;
        v = imag[i];
        imag[i] = imag[j];
        imag[j] = v;
      }
    }
    for (int len = 2; len <= n; len <<= 1) {
      double angle = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
      for (int i = 0; i < n; i += len) {
        double r = 1, im = 0;
        for (int j = 0; j < len / 2; j++) {
          int a = i + j, b = a + len / 2;
          double br = real[b] * r - imag[b] * im, bi = real[b] * im + imag[b] * r;
          real[b] = real[a] - br;
          imag[b] = imag[a] - bi;
          real[a] += br;
          imag[a] += bi;
          double next = r * wr - im * wi;
          im = r * wi + im * wr;
          r = next;
        }
      }
    }
    if (inverse)
      for (int i = 0; i < n; i++) {
        real[i] /= n;
        imag[i] /= n;
      }
  }

  public static float[] spectrum(float[][] wave, int nFft, int hop, int dimF, int dimT) {
    return spectrum(wave, nFft, hop, dimF, dimT, 3);
  }

  public static float[] spectrum(
      float[][] wave, int nFft, int hop, int dimF, int dimT, int lowBins) {
    float[] output = new float[4 * dimF * dimT];
    double[] re = new double[nFft], im = new double[nFft];
    int length = wave[0].length;
    for (int channel = 0; channel < 2; channel++)
      for (int frame = 0; frame < dimT; frame++) {
        for (int i = 0; i < nFft; i++) {
          int at = frame * hop + i - nFft / 2;
          while (at < 0 || at >= length) at = at < 0 ? -at : 2 * length - at - 2;
          re[i] = wave[channel][at] * (.5 - .5 * Math.cos(2 * Math.PI * i / nFft));
          im[i] = 0;
        }
        fft(re, im, false);
        for (int bin = lowBins; bin < dimF; bin++) {
          output[(channel * 2 * dimF + bin) * dimT + frame] = (float) re[bin];
          output[((channel * 2 + 1) * dimF + bin) * dimT + frame] = (float) im[bin];
        }
      }
    return output;
  }

  public static float[][] inverse(float[] spectrum, int nFft, int hop, int dimF, int dimT) {
    int length = (dimT - 1) * hop;
    float[][] result = new float[2][length];
    double[] weights = new double[length + nFft], window = new double[nFft];
    for (int i = 0; i < nFft; i++) window[i] = .5 - .5 * Math.cos(2 * Math.PI * i / nFft);
    for (int frame = 0; frame < dimT; frame++)
      for (int i = 0; i < nFft; i++) weights[frame * hop + i] += window[i] * window[i];
    for (int channel = 0; channel < 2; channel++) {
      double[] sum = new double[length + nFft], re = new double[nFft], im = new double[nFft];
      for (int frame = 0; frame < dimT; frame++) {
        java.util.Arrays.fill(re, 0);
        java.util.Arrays.fill(im, 0);
        for (int bin = 0; bin < dimF; bin++) {
          re[bin] = spectrum[(channel * 2 * dimF + bin) * dimT + frame];
          im[bin] = spectrum[((channel * 2 + 1) * dimF + bin) * dimT + frame];
          if (bin > 0) {
            re[nFft - bin] = re[bin];
            im[nFft - bin] = -im[bin];
          }
        }
        fft(re, im, true);
        for (int i = 0; i < nFft; i++) sum[frame * hop + i] += re[i] * window[i];
      }
      for (int i = 0; i < length; i++) {
        int at = i + nFft / 2;
        result[channel][i] = (float) (sum[at] / Math.max(1e-9, weights[at]));
      }
    }
    return result;
  }
}
