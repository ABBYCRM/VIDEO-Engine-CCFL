"use client";

import {
	ToolInvocation,
	ToolInvocationContentCollapsible,
	ToolInvocationHeader,
	ToolInvocationName,
	ToolInvocationRawData,
} from "@/components/ui/tool-invocation";

export default function ToolInvocationDemo() {
	return (
		<div className="mx-auto w-full max-w-md p-4">
			<ToolInvocation className="w-full">
				<ToolInvocationHeader>
					<ToolInvocationName
						name="search-database"
						type="output-available"
					/>
				</ToolInvocationHeader>
				<ToolInvocationContentCollapsible defaultOpen>
					<ToolInvocationRawData
						data={{ query: "magical forest stories" }}
						title="Arguments"
					/>
					<ToolInvocationRawData
						data="Found several stories about magical forests, including 'The Whispering Woods' - a tale about a magical forest where trees can talk and animals sing beautiful songs."
						title="Result"
					/>
				</ToolInvocationContentCollapsible>
			</ToolInvocation>
		</div>
	);
}