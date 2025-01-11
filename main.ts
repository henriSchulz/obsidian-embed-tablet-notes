import {Command, MarkdownPostProcessorContext, Notice, Plugin} from "obsidian";

import * as pdfjs from "pdfjs-dist";
// @ts-ignore
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

		pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;
		this.registerMarkdownCodeBlockProcessor("notability", this.notabilityCodeBlockProcessor.bind(this));
		this.registerMarkdownCodeBlockProcessor("onenote", this.oneNoteCodeBlockProcessor.bind(this));


		this.addCommand(this.createObsidianNotabilityCommand(
			"Notability Document",
			"add-notability-document"
		))


		const rangeX = [1, 20];
		const rangeY = [1, 20];
		const rangeAnchor = [1, 20];

		//all combinations of anchor and area

		for (let anchor = rangeAnchor[0]; anchor <= rangeAnchor[1]; anchor++) {
			for (let x = rangeX[0]; x <= rangeX[1]; x++) {
				for (let y = rangeY[0]; y <= rangeY[1]; y++) {
					this.addCommand(this.createObsidianNotabilityCommandWithPReact(
						`Notability Document ${anchor} (${x}x${y})`,
						`add-notability-document-${anchor}-${x}-${y}`,
						anchor,
						[x, y]
					))
				}
			}
		}

	}

	private createObsidianNotabilityCommand(name: string, id: string, defaultRect?: number[]): Command {
		return {
			name,
			id,
			// hotkeys: [{modifiers: ["Meta", "Alt"], key: "n"}],
			editorCallback: async (editor, ctx) => {
				const url = editor.getSelection().trim()
				try {
					const doc = NotabilityDocument.fromNoteUrl(url)

					if (!doc) {
						return new Notice("Invalid Document URL")
					}

					if (defaultRect) {
						const jsonTemplate = `\`\`\`notability\n{\n"id": "${doc.id}",\n"rect": [${defaultRect.toString()}]\n }\n\`\`\``


						editor.replaceSelection(jsonTemplate)

					} else {
						const jsonTemplate = `\`\`\`notability\n{\n"id": "${doc.id}"\n }\n\`\`\``
						editor.replaceSelection(jsonTemplate)
					}
				} catch (e) {
					console.log(e)
					new Notice("Invalid Document URL")
				}


			}
		}
	}


	// anchor is between 1 and 20, area is the area of the document in the format [x, y] x and y in points (1p = 39,2px)

	private createObsidianNotabilityCommandWithPReact(name: string, id: string, anchor: number, area: [x: number, y: number]): Command {

		const P = 44.5;

		const anchorX = 62.5

		const anchorY = 83.5 + (anchor - 1) * P;

		const rect = [anchorX, anchorY, (area[0] - 1) * P, (area[1] - 1) * P]

		return this.createObsidianNotabilityCommand(name, id, rect);
	}

	private async notabilityCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const input = source.trim();

		try {
			const notabilityParams = JSON.parse(input) as {
				id?: string,
				name?: string
				noteUrl?: string,
				pdfUrl?: string,
				pRect?: [anchor: number, w: number, h: number]
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


			const arrayBuffer = await doc.getPdfBuffer();

			let parameters: PdfNodeParameters | null = null;
			try {
				parameters = this.readParameters(source);
			} catch (e) {
				el.createEl("h2", {text: "PDF Parameters invalid: " + e.message});
			}


			if (parameters !== null) {


				if (notabilityParams.pRect) {

					if(notabilityParams.pRect[0] < 1 || notabilityParams.pRect[0] > 20) {
						el.createSpan({text: "Invalid Anchor"});
						return;
					}

					if(notabilityParams.pRect[1] < 1 || notabilityParams.pRect[1] > 20) {
						el.createSpan({text: "Invalid Width"});
						return;
					}

					if(notabilityParams.pRect[2] < 1 || notabilityParams.pRect[2] > 20) {
						el.createSpan({text: "Invalid Height"});
						return;
					}

					const P = 44.5;

					const anchorX = 62.5

					const anchorY = 83.5 + (notabilityParams.pRect[0] - 1) * P;

					parameters.rect = [anchorX, anchorY, (notabilityParams.pRect[1] - 1) * P, (notabilityParams.pRect[2] - 1) * P];
				}

				try {


					//@ts-ignore
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
							window.open(`${doc!.getPdfDownloadUrl()}#page=${parameters?.page}`);
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
			parameters.scale = 5.0;
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
	private static CLOUD_FUNCTION_URL_PDF = "https://us-central1-notability-scraper.cloudfunctions.net/pdf/" // /:id/:name

	private readonly documentId: string;
	private documentName: string | null = null

	constructor(documentId: string, documentName?: string) {
		this.documentId = documentId;

		if (documentName) this.documentName = documentName;
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

	get name() {
		return this.documentName
	}

	public setDocumentName(name: string) {
		this.documentName = name;
	}

	public async getPdfBuffer(): Promise<ArrayBuffer> {
		//loads the document name if not already loaded in the cloud function
		const url = `${NotabilityDocument.CLOUD_FUNCTION_URL_PDF}${this.documentId}/${encodeURI(this.documentName ?? "")}`
		const res = await axios.get(url, {
			responseType: 'arraybuffer'
		});
		return res.data;
	}

}



