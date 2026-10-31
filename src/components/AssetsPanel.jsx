import { useState } from 'react';
import { Upload, Check, ImagePlus } from 'lucide-react';
import { Sheet } from './Feedback.jsx';
import { api } from '../lib/api.js';
export default function AssetsPanel({
  assets,
  selected,
  onSelect,
  onUpload,
  onInsert,
  reference,
  onClose,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Sheet
      title="Images"
      subtitle="Upload a photo, then point to where it should go."
      onClose={onClose}
    >
      <label className="btn btn-primary editor-upload">
        <Upload size={14} />
        {busy ? 'Uploading…' : 'Upload image'}
        <input
          disabled={busy}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 3000000) {
              setError('Choose an image under 3 MB.');
              return;
            }
            setBusy(true);
            setError('');
            try {
              const asset = await api.uploadImage(file);
              onUpload(asset);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p className="editor-note">
        PNG, JPEG, WebP or GIF · up to 3 MB. Uploaded images are public so they
        can appear on your published page.
      </p>
      {error && (
        <p role="alert" className="editor-error">
          {error}
        </p>
      )}
      <div className="asset-hint">
        Select an image below, hover a spot on your page and say “add this image
        here.” You can also say “make this image circular” or “give it a
        stronger border.”
      </div>
      <div className="image-grid">
        {assets.map((asset) => (
          <article className="image-card" key={asset.id}>
            <img src={asset.url} alt={asset.name} />
            <b>{asset.name}</b>
            <button
              className="btn btn-quiet btn-sm"
              aria-pressed={selected === asset.id}
              onClick={() => onSelect(asset.id)}
            >
              {selected === asset.id ? (
                <>
                  <Check size={12} />
                  Ready to use
                </>
              ) : (
                'Use on the call'
              )}
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ marginTop: 7 }}
              onClick={() => onInsert(asset)}
            >
              <ImagePlus size={12} />
              {reference?.tag === 'img'
                ? 'Replace selected image'
                : reference
                  ? 'Add to selected spot'
                  : 'Add to page'}
            </button>
          </article>
        ))}
      </div>
    </Sheet>
  );
}
