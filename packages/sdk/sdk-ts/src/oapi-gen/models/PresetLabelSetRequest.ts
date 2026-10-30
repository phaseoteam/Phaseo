/**
 * Send exactly one of version_id and version.
 */
export interface PresetLabelSetRequest {
  version?: string;
  version_id?: string;
}
