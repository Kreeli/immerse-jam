import { useEffect, useState } from 'react';
import Select from '../../shared/Select';
import { jamCall } from '../../platform/project-call';
import { t as tr } from '../../i18n';
export default function DownloadSettings({ disabled }: { disabled: boolean }) {
  const [source, setSource] = useState('auto'),
    [error, setError] = useState('');
  useEffect(() => {
    void jamCall('download-settings')
      .then((value) => setSource(value.source))
      .catch((error) => setError(error.message));
  }, []);
  return (
    <label className="field download-settings">
      {tr('运行库下载源')}
      <Select
        value={source}
        disabled={disabled}
        onChange={(e) => {
          const source = e.target.value;
          void jamCall('download-settings', { source })
            .then(() => {
              setSource(source);
              setError('');
            })
            .catch((error) => setError(error.message));
        }}
      >
        <option value="auto">{tr('自动测速与切换')}</option>
        <option value="mirror">{tr('优先国内镜像（上交 / 清华）')}</option>
        <option value="official">{tr('优先官方源')}</option>
      </Select>
      {error && <small role="status">{error}</small>}
    </label>
  );
}
