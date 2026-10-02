import { useEffect, useState } from "react";
import type { Model } from "./model";
import {
  parseShortlists,
  type SavedShortlist,
} from "./workflows";

export function SavedShortlists({
  models,
  onOpen,
}: {
  models: Model[];
  onOpen: (ids: string[]) => void;
}) {
  const [items, setItems] = useState<SavedShortlist[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    try {
      setItems(parseShortlists(localStorage.getItem("phaseo.shortlists.v1")));
    } catch {
      setStorageAvailable(false);
      setError(
        "Saved shortlists are unavailable in this host or could not be read.",
      );
    }
  }, []);
  function save(next: SavedShortlist[]) {
    try {
      const checked = parseShortlists(JSON.stringify(next));
      localStorage.setItem("phaseo.shortlists.v1", JSON.stringify(checked));
      setItems(next);
      setError("");
      return true;
    } catch {
      setError(
        "Could not save on this device. Your existing shortlists have not been changed.",
      );
      return false;
    }
  }
  return (
    <section className="workflow-panel">
      <h2>Saved shortlists</h2>
      <p className="note">
        Saved on this device and host. Model details refresh when opened.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!models.length || !name.trim()) return;
          if (items.some((item) => item.name === name.trim())) { setError("A shortlist with this name already exists. Choose another name."); return; }
          if (
            items.length >= 20
          ) {
            setError("You can save up to 20 shortlists.");
            return;
          }
          const next = [
            ...items,
            { name: name.trim(), ids: models.map((model) => model.id) },
          ];
          if (save(next)) {
            setNotice(`Saved ${name.trim()}.`);
            setName("");
          }
        }}
      >
        <label>
          Shortlist name
          <input
            value={name}
            maxLength={60}
            required
            onChange={(event) => {
              setName(event.target.value);
              setNotice("");
            }}
          />
        </label>
        <button disabled={!storageAvailable || !models.length || !name.trim()}>
          Save selected models
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!items.length && <p className="note">No saved shortlists.</p>}
      <ul className="saved-list">
        {items.map((item) => (
          <li key={item.name}>
            <button onClick={() => onOpen(item.ids)}>{item.name}</button>
            <span>{item.ids.join(" · ")}</span>
            <button
              aria-label={`Delete ${item.name}`}
              onClick={() => {
                if (save(items.filter((entry) => entry.name !== item.name)))
                  setNotice(`Deleted ${item.name}.`);
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
