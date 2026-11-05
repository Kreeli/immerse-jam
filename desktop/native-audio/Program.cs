using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Immerse.AudioHost;

sealed class PcmQueue : IWaveProvider
{
    readonly object gate = new();
    readonly byte[] buffer;
    int head, length;
    public WaveFormat WaveFormat { get; }
    public int BufferedFrames { get { lock (gate) return length / 8; } }
    public PcmQueue(int rate)
    {
        WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(rate, 2);
        buffer = new byte[rate * 8 / 2];
    }
    public void Write(byte[] source, int count)
    {
        if (count % 8 != 0) throw new InvalidDataException("PCM frame alignment");
        lock (gate)
        {
            if (count > buffer.Length - length) throw new IOException("Audio output queue overflow");
            for (int i = 0; i < count; i++) buffer[(head + length + i) % buffer.Length] = source[i];
            length += count;
        }
    }
    public int Read(byte[] target, int offset, int count)
    {
        lock (gate)
        {
            int copy = Math.Min(count, length);
            for (int i = 0; i < copy; i++) target[offset + i] = buffer[(head + i) % buffer.Length];
            head = (head + copy) % buffer.Length;
            length -= copy;
            Array.Clear(target, offset + copy, count - copy);
            return count;
        }
    }
}
record Configuration(string Backend, string DeviceId, int SampleRate);
static class Program
{
    static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };
    static readonly object MessageGate = new();
    static void Send(object value) { lock (MessageGate) { Console.WriteLine(JsonSerializer.Serialize(value, Json)); Console.Out.Flush(); } }
    [DllImport("user32.dll")] static extern bool PeekMessage(out Message message, nint window, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")] static extern nint DispatchMessage(ref Message message);
    [StructLayout(LayoutKind.Sequential)] struct Message { public nint Window; public uint Id; public nuint W; public nint L; public uint Time; public int X; public int Y; public uint Private; }
    [STAThread]
    static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.SequenceEqual(new[] { "--self-test" })) return SelfTest();
            if (args.SequenceEqual(new[] { "--list" })) { ListDevices(); return 0; }
            if (args.Length != 2 || args[0] != "--play") throw new ArgumentException("Invalid audio host command");
            var config = JsonSerializer.Deserialize<Configuration>(Encoding.UTF8.GetString(Convert.FromBase64String(args[1])), Json)
                ?? throw new ArgumentException("Invalid configuration");
            if (!new[] { 44100, 48000, 88200, 96000 }.Contains(config.SampleRate) ||
                !new[] { "wasapi", "wasapi-exclusive", "wasapi-low-latency", "directsound", "asio" }.Contains(config.Backend) ||
                config.DeviceId.Length > 2048) throw new ArgumentException("Invalid audio configuration");
            return Play(config);
        }
        catch (Exception error) { Send(new { type = "error", message = error.Message, code = error.HResult }); return 1; }
    }
    static void ListDevices()
    {
        var devices = new List<object>();
        var errors = new List<string>();
        using var enumerator = new MMDeviceEnumerator();
        string? defaultId = null;
        try { using var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia); defaultId = device.ID; } catch (Exception e) { errors.Add(e.Message); }
        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        {
            using (device)
            {
                using var probe = device.AudioClient;
                var mixRate = probe.MixFormat.SampleRate;
                foreach (var backend in new[] { "wasapi", "wasapi-exclusive", "wasapi-low-latency" })
                    devices.Add(new { backend, deviceId = device.ID, name = device.FriendlyName, isDefault = device.ID == defaultId, deviceSampleRate = mixRate });
            }
        }
        try
        {
            foreach (var device in DirectSoundOut.Devices)
                devices.Add(new { backend = "directsound", deviceId = device.Guid.ToString(), name = device.Description, isDefault = device.Guid == Guid.Empty, deviceSampleRate = (int?)null });
        }
        catch (Exception e) { errors.Add(e.Message); }
        try
        {
            foreach (var name in AsioOut.GetDriverNames())
                devices.Add(new { backend = "asio", deviceId = name, name, isDefault = false, deviceSampleRate = (int?)null });
        }
        catch (Exception e) { errors.Add(e.Message); }
        Send(new { available = true, architecture = "x64", devices, errors });
    }
    static int Play(Configuration config)
    {
        var source = new PcmQueue(config.SampleRate);
        MMDevice? endpoint = null;
        using var enumerator = new MMDeviceEnumerator();
        IWavePlayer player;
        int deviceRate = config.SampleRate, deviceBufferFrames = 0, primingFrames = 1024;
        if (config.Backend.StartsWith("wasapi"))
        {
            endpoint = config.DeviceId == "default"
                ? enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia)
                : enumerator.GetDevice(config.DeviceId);
            var exclusive = config.Backend == "wasapi-exclusive";
            var mode = exclusive ? AudioClientShareMode.Exclusive : AudioClientShareMode.Shared;
            int milliseconds = config.Backend == "wasapi" ? 60 : 10;
            primingFrames += config.SampleRate * milliseconds / 1000;
            IWaveProvider provider = source;
            int mixRate;
            using (var probe = endpoint.AudioClient)
            {
                mixRate = probe.MixFormat.SampleRate;
                if (exclusive && !probe.IsFormatSupported(mode, source.WaveFormat))
                {
                    var pcm16 = new WaveFormat(config.SampleRate, 16, 2);
                    if (!probe.IsFormatSupported(mode, pcm16))
                        throw new NotSupportedException("The selected device does not support exclusive stereo output at this sample rate.");
                    provider = new WaveFloatTo16Provider(source);
                }
            }
            var wasapi = new WasapiOut(endpoint, mode, true, milliseconds);
            player = wasapi;
            try { player.Init(provider); deviceRate = exclusive ? wasapi.OutputWaveFormat.SampleRate : mixRate; }
            catch { player.Dispose(); endpoint.Dispose(); throw; }
            if (exclusive && deviceRate != config.SampleRate) { player.Dispose(); endpoint.Dispose(); throw new NotSupportedException("Exclusive output cannot change the requested sample rate."); }
        }
        else if (config.Backend == "directsound")
        {
            var id = config.DeviceId == "default" ? Guid.Empty : Guid.Parse(config.DeviceId);
            if (id != Guid.Empty && !DirectSoundOut.Devices.Any(d => d.Guid == id)) throw new ArgumentException("The DirectSound output device is unavailable.");
            deviceRate = 0; // DirectSound does not expose the physical mixer sample rate.
            primingFrames += config.SampleRate * 60 / 1000;
            player = new DirectSoundOut(id, 60);
            try { player.Init(source); } catch { player.Dispose(); throw; }
        }
        else
        {
            if (!AsioOut.GetDriverNames().Contains(config.DeviceId)) throw new ArgumentException("The selected x64 ASIO driver is unavailable.");
            var asio = new AsioOut(config.DeviceId);
            player = asio;
            try
            {
                if (!asio.IsSampleRateSupported(config.SampleRate)) throw new NotSupportedException("The ASIO driver does not support this sample rate.");
                player.Init(source);
                deviceBufferFrames = asio.FramesPerBuffer;
                primingFrames += deviceBufferFrames;
            }
            catch { player.Dispose(); throw; }
        }
        using (player)
        using (endpoint)
        using (var done = new ManualResetEventSlim(false))
        {
            Exception? failure = null;
            player.PlaybackStopped += (_, e) => { if (e.Exception != null) { failure = e.Exception; done.Set(); } };
            Send(new { type = "ready", backend = config.Backend, sampleRate = config.SampleRate, deviceSampleRate = deviceRate, deviceBufferFrames });
            var reader = Task.Run(() =>
            {
                try
                {
                    using var input = Console.OpenStandardInput();
                    var bytes = new byte[32768 + 8];
                    int carry = 0, read;
                    while ((read = input.Read(bytes, carry, 32768)) > 0)
                    {
                        int total = carry + read, aligned = total - total % 8;
                        if (aligned > 0) source.Write(bytes, aligned);
                        carry = total - aligned;
                        if (carry > 0) Array.Copy(bytes, aligned, bytes, 0, carry);
                    }
                    if (carry != 0) throw new InvalidDataException("Incomplete PCM frame");
                }
                catch (Exception e) { failure = e; }
                finally { done.Set(); }
            });
            bool started = false;
            while (!done.Wait(5))
            {
                if (!started && source.BufferedFrames >= primingFrames) { player.Play(); started = true; }
                while (PeekMessage(out var message, 0, 0, 0, 1)) { TranslateMessage(ref message); DispatchMessage(ref message); }
            }
            if (started) player.Stop();
            if (failure != null) throw failure;
        }
        return 0;
    }
    static int SelfTest()
    {
        var queue = new PcmQueue(48000);
        var source = new byte[16];
        BitConverter.GetBytes(0.25f).CopyTo(source, 0);
        BitConverter.GetBytes(-0.5f).CopyTo(source, 4);
        queue.Write(source, source.Length);
        var read = new byte[24];
        if (queue.Read(read, 0, read.Length) != read.Length || BitConverter.ToSingle(read) != 0.25f ||
            BitConverter.ToSingle(read, 4) != -0.5f || read.Skip(16).Any(b => b != 0) || queue.BufferedFrames != 0)
            throw new Exception("PCM queue round trip failed");
        bool alignment = false, bounded = false;
        try { queue.Write(source, 7); } catch (InvalidDataException) { alignment = true; }
        try { queue.Write(new byte[48000 * 8], 48000 * 8); } catch (IOException) { bounded = true; }
        if (!alignment || !bounded) throw new Exception("PCM queue bounds failed");
        Send(new { passed = true, checks = new[] { "stereo-float-round-trip", "zero-fill-underrun", "frame-alignment", "bounded-queue" } });
        return 0;
    }
}
