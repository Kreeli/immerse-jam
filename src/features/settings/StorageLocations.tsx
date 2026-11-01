import { jamCall } from '../../platform/project-call';
import { useEffect, useState } from 'react';
import { t as tr } from '../../i18n';
import { isAndroid } from '../../platform/environment';
export default function StorageLocations() {
  const [paths, setPaths] = useState<{ libraryPath: string; runtimePath: string } | null>(null);
  useEffect(() => {
    void jamCall('runtime-status').then(setPaths);
  }, []);
  return (
    <section className="storage-locations">
      <h3>{tr('存储位置')}</h3>
      <p>
        {isAndroid
          ? tr('音乐与录音保存在应用专用目录。卸载前请导出需要保留的内容。')
          : tr('安装向导会自动准备运行库和所选模型，所有下载保存在指定的数据目录。')}
      </p>
      {paths && (
        <dl>
          <dt>{tr('音乐与录音')}</dt>
          <dd>{paths.libraryPath}</dd>
          {!isAndroid && (
            <>
              <dt>{tr('运行库与模型')}</dt>
              <dd>{paths.runtimePath}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
