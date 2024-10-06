import {Plugin, Command, Notice, Editor, MarkdownView, MarkdownFileInfo, MarkdownPostProcessorContext} from "obsidian";

import * as pdfjs from "pdfjs-dist";
import * as worker from "pdfjs-dist/build/pdf.worker.entry.js";
import {NotabilityDocument} from "./utils/NotabilityDocument";

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

	}

	private async notabilityCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const input = source.trim();

		try {
			const notabilityParams = JSON.parse(input) as {
				id?: string,
				name?: string
			}

			if(!notabilityParams.id){
				el.createSpan({text: "Enter a valid Notability Document ID"});
				return;
			}

			if(!notabilityParams.name){
				el.createSpan({text: "Enter a valid Notability Document Name"});
			}

			const doc = new NotabilityDocument(notabilityParams.id, notabilityParams.name);

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
					const buffer = Buffer.from(arrayBuffer);
					console.log("Buffer downloaded [x]")
					const document = await pdfjs.getDocument(buffer).promise;


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
							window.open(doc.getNoteUrl());
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



