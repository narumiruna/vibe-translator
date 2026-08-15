import {
	CheckCircledIcon,
	ExclamationTriangleIcon,
	InfoCircledIcon,
} from "@radix-ui/react-icons";
import {
	Button,
	Callout,
	Card,
	Heading,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";

function FormSection({ children, id, title }) {
	return (
		<section className="form-section" aria-labelledby={id}>
			<Heading as="h2" id={id} className="form-section-title" size="2">
				{title}
			</Heading>
			<div className="form-section-content">{children}</div>
		</section>
	);
}

function FieldLabel({ children, id, label, note }) {
	const noteId = note ? `${id}-note` : undefined;

	return (
		<label className="field" htmlFor={id}>
			<Text as="span" className="field-label" size="2" weight="medium">
				{label}
			</Text>
			{note ? (
				<Text as="span" className="field-note" id={noteId} size="1">
					{note}
				</Text>
			) : null}
			{children(noteId)}
		</label>
	);
}

function TextInput({ id, invalid = false, label, note, ...props }) {
	return (
		<FieldLabel id={id} label={label} note={note}>
			{(noteId) => (
				<TextField.Root
					{...props}
					aria-describedby={
						[noteId, invalid ? "form-status" : ""].filter(Boolean).join(" ") ||
						undefined
					}
					aria-invalid={invalid || undefined}
					id={id}
					size="3"
				/>
			)}
		</FieldLabel>
	);
}

function NumberInput({ id, label, note, ...props }) {
	return (
		<TextInput {...props} id={id} label={label} note={note} type="number" />
	);
}

function TextAreaInput({ id, invalid = false, label, note, ...props }) {
	return (
		<FieldLabel id={id} label={label} note={note}>
			{(noteId) => (
				<TextArea
					{...props}
					aria-describedby={
						[noteId, invalid ? "form-status" : ""].filter(Boolean).join(" ") ||
						undefined
					}
					aria-invalid={invalid || undefined}
					id={id}
					size="3"
				/>
			)}
		</FieldLabel>
	);
}

function NativeSelect({ children, id, label, note, ...props }) {
	return (
		<FieldLabel id={id} label={label} note={note}>
			{(noteId) => (
				<select
					{...props}
					aria-describedby={noteId}
					className="native-select"
					id={id}
				>
					{children}
				</select>
			)}
		</FieldLabel>
	);
}

function CheckboxField({ checked, id, label, note, onChange }) {
	const noteId = note ? `${id}-note` : undefined;

	return (
		<label className="checkbox-field" htmlFor={id}>
			<span className="checkbox-control">
				<input
					aria-describedby={noteId}
					checked={checked}
					id={id}
					onChange={onChange}
					type="checkbox"
				/>
				<Text as="span" size="2" weight="medium">
					{label}
				</Text>
			</span>
			{note ? (
				<Text as="span" className="field-note" id={noteId} size="1">
					{note}
				</Text>
			) : null}
		</label>
	);
}

function StatusCard({ children, title }) {
	return (
		<Card className="status-card" size="2">
			<Heading as="h3" size="2">
				{title}
			</Heading>
			{children}
		</Card>
	);
}

function StatusBanner({ banner }) {
	const tone = banner?.tone || "gray";
	const Icon =
		tone === "red"
			? ExclamationTriangleIcon
			: tone === "green"
				? CheckCircledIcon
				: InfoCircledIcon;

	return (
		<Callout.Root
			aria-live={tone === "red" ? "assertive" : "polite"}
			className="status-banner"
			color={tone}
			hidden={!banner}
			id="form-status"
			role={tone === "red" ? "alert" : "status"}
			size="1"
		>
			<Callout.Icon>
				<Icon aria-hidden="true" />
			</Callout.Icon>
			<Callout.Text>{banner?.message || ""}</Callout.Text>
		</Callout.Root>
	);
}

export {
	Button,
	CheckboxField,
	FieldLabel,
	FormSection,
	NativeSelect,
	NumberInput,
	StatusBanner,
	StatusCard,
	TextAreaInput,
	TextInput,
};
