import axios from "axios";


export class NotabilityDocument {

	private static NOTE_URL = "https://notability.com/n/"
	private static PDF_URL = "https://notability.com/n/download/pdf/"
	private static CLOUD_FUNCTION_URL = "https://us-central1-notability-scraper.cloudfunctions.net/pdf/" // /:id/:name


	private documentId: string;
	private documentName: string | null = null

	constructor(documentId: string, documentName?: string) {
		this.documentId = documentId;

		if (documentName) this.documentName = documentName;
	}


	async load(): Promise<{ exists: boolean }> {
		const url = NotabilityDocument.CLOUD_FUNCTION_URL + this.documentId;
		try {

			const response = await axios.get(url);

			if (response.status !== 200) {
				return {exists: false}
			}

			const document = response.data.document as {
				documentId: string,
				documentName: string,
				pdfDownloadUrl: string,
				documentUrl: string
			}

			this.documentName = document.documentName;
			return {exists: true};
		} catch (e) {
			console.log(e)
			return {exists: false};
		}
	}

	public getNoteUrl(): string {
		return `${NotabilityDocument.NOTE_URL}${this.documentId}`;
	}

	public getPdfDownloadUrl(): string {
		return `${NotabilityDocument.PDF_URL}${this.documentId}/${encodeURI(this.documentName ?? "")}.pdf`;
	}

	public static fromPdfUrl(pdfUrl: string): NotabilityDocument | null {
		const split = pdfUrl.split("/");
		if (split.length < 5) {
			return null;
		}
		const documentId = split[4];
		const documentName = split[5].replace(".pdf", "");
		return new NotabilityDocument(documentId, documentName);
	}


	// document Name is not available in the pdf url
	public static fromNoteUrl(noteUrl: string): NotabilityDocument | null {
		const split = noteUrl.split("/");
		if (split.length < 5) {
			return null;
		}
		const documentId = split[4];
		return new NotabilityDocument(documentId);
	}

	get id() {
		return this.documentId;
	}

	public getPdfBuffer(): Promise<ArrayBuffer> {
		return axios.get(`${NotabilityDocument.CLOUD_FUNCTION_URL}${this.documentId}/${this.documentName}`, {
			responseType: 'arraybuffer'
		}).then((res) => res.data);
	}

}


