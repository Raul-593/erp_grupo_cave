/** Prompt versionado de extracción. `version` se guarda en tdr_extractions.prompt_version. */
export interface ExtractionPrompt {
  readonly version: string;
  /** Instrucciones de sistema, comunes a todos los proveedores. */
  readonly system: string;
  /** Mensaje del usuario que acompaña al PDF adjunto. */
  readonly user: string;
}
