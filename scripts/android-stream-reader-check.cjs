const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process');
const config = require('../.runtime/android/config.json');
const dir = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/stream-reader-'));
const java = `import java.io.*;import java.nio.*;import app.immersejam.mobile.processing.*;
public class WindowCheck { public static void main(String[] args)throws Exception {
 File file=new File(args[0],"large.wav");
 try {
  try(RandomAccessFile out=new RandomAccessFile(file,"rw")) {
   ByteBuffer h=ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
   h.put("RIFF".getBytes()).putInt(1000000036).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)3).putShort((short)2).putInt(48000).putInt(384000).putShort((short)8).putShort((short)32).put("data".getBytes()).putInt(1000000000);
   out.write(h.array());out.setLength(1000000044L);
   out.seek(44);out.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putFloat(.25f).putFloat(-.5f).array());
  }
  try(WaveReader reader=new WaveReader(file)) {
   byte[] first=PcmWindow.read(reader,0),last=PcmWindow.read(reader,reader.frames-48000);
   if(first.length!=48002*8 || last.length!=48000*8)throw new AssertionError("window size");
   ByteBuffer b=ByteBuffer.wrap(first).order(ByteOrder.LITTLE_ENDIAN);
   if(Math.abs(b.getFloat()-.25)>.00001 || Math.abs(b.getFloat()+.5)>.00001)throw new AssertionError("PCM values");
   if(PcmWindow.read(reader,reader.frames+1).length!=0)throw new AssertionError("end");
   System.out.println("STREAM_READER_PASSED mediaBytes="+file.length()+" maxWindowBytes="+first.length+" heapLimitMb=32");
  }
 } finally {if(!file.delete())throw new IOException("cleanup failed");}
}}
`;
fs.writeFileSync(path.join(dir, 'WindowCheck.java'), java);
const source = path.resolve('platforms/android/app/src/main/java/app/immersejam/mobile/processing');
for (const [exe, args] of [
  [
    'javac.exe',
    [
      '-d',
      dir,
      path.join(source, 'WaveReader.java'),
      path.join(source, 'PcmWindow.java'),
      path.join(dir, 'WindowCheck.java'),
    ],
  ],
  ['java.exe', ['-Xmx32m', '-cp', dir, 'WindowCheck', dir]],
]) {
  const result = cp.spawnSync(path.join(config.java, 'bin', exe), args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) process.exit(result.status || 1);
}
