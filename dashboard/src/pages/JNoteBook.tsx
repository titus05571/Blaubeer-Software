export default function JNotebook() {
    return (
        <div className="content-body">
            <iframe
                src="http://www.jupyter.org"
                title="Jupyter Notebook"
                style={{
                    width: "100%",
                    height: "calc(100vh - 100px)",
                    border: "none",
                }}
            />
        </div>
    );
} 