import React from "react";
import { FiPlus } from "react-icons/fi";

const EmptyCardComponenets = ({
    title,
    description,
    onAction,
    actionTitle = "Upload Document",
}) => {
    return (
        <div
            className="d-flex flex-column align-items-center justify-content-center text-center"
            style={{
                minHeight: "480px",
            }}
        >
            <div className="card-body d-flex align-items-center justify-content-center">
                <div className="text-center">
                    <h5 className="fw-bold mb-2">{title}</h5>

                    <p className="text-muted mb-4">
                        {description}
                    </p>

                    <button
                        type="button"
                        onClick={onAction}
                        className="btn btn-light rounded-circle d-flex align-items-center justify-content-center mx-auto"
                        style={{
                            width: "52px",
                            height: "52px",
                        }}
                        title={actionTitle}
                    >
                        <FiPlus size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmptyCardComponenets;