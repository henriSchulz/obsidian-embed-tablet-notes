import {Plugin, Command, Notice, Editor, MarkdownView, MarkdownFileInfo, MarkdownPostProcessorContext} from "obsidian";

import * as pdfjs from "pdfjs-dist";
// @ts-ignore
import * as worker from "pdfjs-dist/build/pdf.worker.entry.js";

import axios from "axios";

interface PdfNodeParameters {
	range: Array<number>;
	url: string;
	link: boolean;
	page: number | Array<number | Array<number>>;
	scale: number;
	fit: boolean,
	rotation: number;
	rect: Array<number>;
}

export default class Main extends Plugin {


	onload() {
		const item = this.addStatusBarItem().createSpan("hello-world-span");
		item.setText("Hello, world!");

		this.registerMarkdownCodeBlockProcessor("notability", this.notabilityCodeBlockProcessor.bind(this));
		this.registerMarkdownCodeBlockProcessor("onenote", this.oneNoteCodeBlockProcessor.bind(this));

	}

	private async notabilityCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const input = source.trim();

		try {
			const notabilityParams = JSON.parse(input) as {
				id?: string,
				name?: string
				noteUrl?: string,
				pdfUrl?: string
			}

			// necessary  is at least the id or the noteUrl or the pdfUrl

			if (!notabilityParams.id && !notabilityParams.noteUrl && !notabilityParams.pdfUrl) {
				el.createSpan({text: "Enter a valid Notability Document ID"});
				return;
			}

			let doc: NotabilityDocument | null = null;


			if (notabilityParams.noteUrl) {
				doc = NotabilityDocument.fromNoteUrl(notabilityParams.noteUrl);
				if (!doc) {
					el.createSpan({text: "Invalid Note URL"});
					return;
				}
				if (notabilityParams.name) {
					doc.setDocumentName(notabilityParams.name);
				}
			}

			if (notabilityParams.pdfUrl) {
				doc = NotabilityDocument.fromPdfUrl(notabilityParams.pdfUrl);
				if (!doc) {
					el.createSpan({text: "Invalid PDF URL"});
					return;
				}
			}

			if (notabilityParams.id) {
				doc = new NotabilityDocument(notabilityParams.id, notabilityParams.name);
			}

			if (!doc) {
				el.createSpan({text: "Invalid Notability Document: Enter a valid Notability Document ID, a Note URL or a PDF URL"});
				return;
			}


			pdfjs.GlobalWorkerOptions.workerSrc = worker;

			const arrayBuffer = await doc.getPdfBuffer();

			let parameters: PdfNodeParameters | null = null;
			try {
				parameters = this.readParameters(source);
			} catch (e) {
				el.createEl("h2", {text: "PDF Parameters invalid: " + e.message});
			}

			if (parameters !== null) {
				try {
					console.log("Buffer downloaded [x]")
					const document = await pdfjs.getDocument(arrayBuffer).promise;


					if ((<number[]>parameters.page).includes(0)) {
						var pagesArray = [];
						for (var i = 1; i <= document.numPages; i++) {
							pagesArray.push(i);
						}
						parameters.page = pagesArray;
					}

					//Read pages
					for (const pageNumber of <number[]>parameters.page) {
						const page = await document.getPage(pageNumber);
						let host = el;

						// Get Viewport
						const offsetX = Math.floor(
							parameters.rect[0] * -1 * parameters.scale
						);
						const offsetY = Math.floor(
							parameters.rect[1] * -1 * parameters.scale
						);

						// Render Canvas
						const canvas = host.createEl("canvas");
						canvas.onclick = () => {
							window.open(doc!.getNoteUrl());
						}
						if (parameters.fit) {
							canvas.style.width = "100%";
						}

						const context = canvas.getContext("2d");

						const baseViewportWidth = page.getViewport({scale: 1.0}).width;
						const baseScale = canvas.clientWidth ? canvas.clientWidth / baseViewportWidth : 1;

						const viewport = page.getViewport({
							scale: baseScale * parameters.scale,
							rotation: parameters.rotation,
							offsetX: offsetX,
							offsetY: offsetY,
						});

						if (parameters.rect[2] < 1) {
							canvas.height = viewport.height;
							canvas.width = viewport.width;
						} else {
							canvas.height = Math.floor(parameters.rect[2] * parameters.scale);
							canvas.width = Math.floor(parameters.rect[3] * parameters.scale);
						}

						const renderContext = {
							canvasContext: context,
							viewport: viewport,
						};
						console.log("Rendering page " + pageNumber);
						//@ts-ignore
						page.render(renderContext);
					}
				} catch (error) {
					console.log(error)
					el.createEl("h2", {text: error});
				}
			}


		} catch (e) {
			console.log(e);
			el.createSpan({text: e});
		}


	}

	private async oneNoteCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const input = source.trim();

		try {
			const oneNoteParams = JSON.parse(input) as {
				url: string
			}

			if (!oneNoteParams.url) {
				el.createSpan({text: "Enter a valid OneNote URL"});
				return;
			}

			const iframe = el.createEl("iframe");
			iframe.src = oneNoteParams.url;
			iframe.setCssStyles({
				width: "100%",
				height: "100vh",
			})
			iframe.onclick = () => {
				window.open(oneNoteParams.url);
			}

			if (iframe.contentWindow?.document.getElementById("Header")) {
				const contentWindow = iframe.contentWindow;
				const header = contentWindow.document.getElementById("Header");
				header?.remove();
			}


		} catch (e) {
			console.log(e);
			el.createSpan({text: e});
		}

	}

	private readParameters(jsonString: string) {


		const parameters: PdfNodeParameters = JSON.parse(jsonString);

		if (parameters.link === undefined) {
			parameters.link = true;
		}

		if (parameters.range !== undefined) {
			parameters.page = Array.from({length: parameters.range[1] - parameters.range[0] + 1}, (_, i) => parameters.range[0] + i);
		}

		if (typeof parameters.page === "number") {
			parameters.page = [parameters.page];
		}
		if (parameters.page === undefined) {
			parameters.page = [1];
		}

		for (let i = 0; i < parameters.page.length; i++) {
			if (Array.isArray(parameters.page[i])) {
				const range = parameters.page.splice(i, 1)[0] as Array<number>;
				for (let j = range[0]; j <= range[1]; j++) {
					parameters.page.splice(i, 0, j);
					i += 1;
				}
			}
		}

		if (
			parameters.scale === undefined ||
			parameters.scale < 0.1 ||
			parameters.scale > 10.0
		) {
			parameters.scale = 1.0;
		}

		if (parameters.fit === undefined) {
			parameters.fit = true
		}

		if (parameters.rotation === undefined) {
			parameters.rotation = 0;
		}

		if (parameters.rect === undefined) {
			parameters.rect = [0, 0, 0, 0];
		}
		return parameters;
	}


}

class NotabilityDocument {

	private static NOTE_URL = "https://notability.com/n/"
	private static PDF_URL = "https://notability.com/n/download/pdf/"
	private static CLOUD_FUNCTION_URL = "https://us-central1-notability-scraper.cloudfunctions.net/pdf/" // /:id/:name


	private readonly documentId: string;
	private documentName: string | null = null

	constructor(documentId: string, documentName?: string) {
		this.documentId = documentId;

		if (documentName) this.documentName = documentName;
	}


	async loadDocumentName(): Promise<{ exists: boolean }> {
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

	public setDocumentName(name: string) {
		this.documentName = name;
	}

	public async getPdfBuffer(): Promise<ArrayBuffer> {
		//loads the document name if not already loaded in the cloud function
		const url = `${NotabilityDocument.CLOUD_FUNCTION_URL}${this.documentId}/${encodeURI(this.documentName ?? "")}`
		const res = await axios.get(url, {
			responseType: 'arraybuffer'
		});
		return res.data;
	}

}



