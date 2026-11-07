// Build common CRUD messages for an entity name.
const generateMessage = (entity) => ({
    alreadyExist: `${entity} already exist`,
    notExist: `${entity} not found`,
    created: `${entity} created successfully`,
    failToCreate: `Failed to create ${entity}`,
    updated: `${entity} updated successfully`,
    failToUpdate: `Failed to update ${entity}`,
    deleted: `${entity} deleted successfully`,
    failToDelete: `Failed to delete ${entity}`,
    fetchedSuccessfully: `${entity} fetched successfully`,
    failToFetch: `${entity} failed to fetch`
});

export const messages = {
    settings: {
        ...generateMessage("Settings"),
    },
    rating: {
        ...generateMessage("Teacher rating"),
        purchaseRequired: "An approved purchase from this teacher is required before rating",
    },
    notification: {
        fanoutFailed: "Notification distribution failed",
        ...generateMessage("Notification"),
        read: "Notifications marked as read",
    },
    // Application, authentication, and infrastructure messages.
    app: {
        jobCompleted: "Background job pass completed",
        listening: (port) => `App listening on port ${port}`,
        startupFailed: "Failed to start application",
    },
    auth: {
        whatsappUnavailable: "WhatsApp password recovery is not available yet",
        resetDeliveryFailed: "WhatsApp recovery delivery failed",
        resetRequested: "If the account is eligible, a recovery code will be sent to its registered WhatsApp number",
        resetInvalid: "Invalid or expired recovery code",
        passwordReset: "Password reset successfully; log in again",
        tokenMissing: "Authentication token is required",
        invalidToken: "Invalid or expired authentication token",
        loginIdentifierRequired: "Provide either name or email to log in",
        secretMissing: "SECRET_KEY is not configured",
        deviceIdMismatch: "This token is not valid for this device",
        accountOpenOnAnotherDevice: "This account is logged in on another device. Log out from that device to continue.",
        deviceLimitReached: "The allowed number of devices is already registered. Log out from another device to continue.",
    },
    database: {
        urlMissing: "DB_URL is not configured",
        neonUrlMissing: "NEON_DATABASE_URL is not configured",
        connected: "DB connected successfully",
    },
    // Email content and delivery errors.
    email: {
        credentialsMissing: "Email credentials are not configured",
        otpSubject: "Noldg Academy - Your OTP Code",
        otpHtml: (otp) => `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f6fff0; text-align: center;">
            <h2 style="color: #1800f5ff;">Noldg Academy</h2>
            <p style="font-size: 16px; color: #333;">Your One-Time Password (OTP) is:</p>
            <div style="font-size: 24px; font-weight: bold; color: #fff; background: #1800f5ff; padding: 12px; display: inline-block; border-radius: 8px; letter-spacing: 2px;">${otp}</div>
            <p style="color: #555; font-size: 14px; margin-top: 10px;">This OTP is valid for <strong>10 minutes</strong>. Please do not share it with anyone.</p>
            <p style="color: #777; font-size: 14px;">If you did not request this code, you can ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">Copyright Noldg Academy. All rights reserved.</p>
          </div>
        `,
    },
    // Shared errors and one-time setup messages.
    error: {
        relatedRecords: "This record is referenced by other records",
        rateLimited: "Too many requests; try again later",
        cleanupFailed: "Deferred media cleanup failed",
        duplicateRecord: "A record with this value already exists",
        internal: "Internal server error",
        invalidRequest: "Invalid request data",
        statusUpdateConflict: "The account status changed before the update completed",
    },
    setup: {
        superAdminFlagRequired: "Set BOOTSTRAP_SUPER_ADMIN=true to run this one-time setup",
        superAdminExists: "A super admin account already exists",
        emailExists: "An account with this email already exists",
        invalidAccountData: "Super admin account data is invalid",
        superAdminCreated: (email) => `Super admin account created: ${email}`,
        failed: "Super admin setup failed",
    },
    upload: {
        invalidFileType: "Invalid file format",
    },
    // Messages returned by user account endpoints.
    user: {
        ...generateMessage("user"),
        accountCreated: "Account created successfully",
        invalidCredentials: "Invalid credentials",
        loginSuccess: "Login successful",
        logoutSuccess: "Logout successful",
        emailTaken: "Email already exist",
        nameTaken: "Name already exist",
        accountSuspended: "This account is suspended",
        registrationClosed: "Registration is currently closed",
        lastSuperAdmin: "The last active super admin cannot be suspended",
        unauthorized: "Unauthorized",
    },
    // Messages returned by academic catalog endpoints.
    academic: {
        fetchedSuccessfully: "Academic data fetched successfully",
        created: "Academic record created successfully",
        updated: "Academic record updated successfully",
        deleted: "Academic link deleted successfully",
        trackAlreadyExists: "This study track already exists",
        trackNotExist: "Study track not found",
        subjectNotExist: "Subject not found",
        trackSubjectAlreadyExists: "This subject is already linked to the study track",
        trackSubjectNotExist: "The subject is not linked to the study track",
        americanSecondaryOnly: "The American Diploma supports secondary stage only",
    },
    // Messages returned by teacher profiles and approval endpoints.
    teacher: {
        fetchedSuccessfully: "Teacher data fetched successfully",
        signupCreated: "Teacher account created and application submitted for approval",
        applicationCreated: "Teacher application submitted successfully",
        applicationAlreadyExists: "A teacher application is already pending or approved",
        applicationNotFound: "Teacher application not found or already reviewed",
        profileNotFound: "Approved teacher profile not found",
        offeringNotFound: "One or more selected subjects are not linked to active study tracks",
        duplicateOffering: "A teaching subject cannot be selected more than once for the same study track",
        userNotEligible: "Only teacher accounts can resubmit rejected applications",
        userNotActive: "Only active teacher accounts can be approved",
        approvalRequired: "Teacher account approval is required",
        approved: "Teacher application approved successfully",
        rejected: "Teacher application rejected successfully",
        profileUpdated: "Teacher profile updated successfully",
        profileUpdateRequired: "Provide at least one teacher profile field to update",
    },
    // Messages returned by teacher course endpoints.
    course: {
        fetchedSuccessfully: "Courses fetched successfully",
        studentsFetchedSuccessfully: "Course students fetched successfully",
        notFound: "Course not found",
    },
    // Messages returned by lesson management and access endpoints.
    lesson: {
        uploadReady: "Lesson upload signature created successfully",
        created: "Lesson created successfully",
        fetchedSuccessfully: "Lessons fetched successfully",
        updated: "Lesson updated successfully",
        courseNotFound: "Course not found",
        notFound: "Lesson not found",
        teacherApprovalRequired: "Teacher approval is required to manage lessons",
        liveDisabled: "Live lessons are not available yet",
        videoRequired: "Upload a video before publishing a recorded lesson",
        availabilityWindowInvalid: "Lesson end time must be later than its start time",
        updateRequired: "Provide lesson details or a media file to update",
        accessDenied: "You do not have access to this lesson",
        accessGranted: "Lesson access granted successfully",
        videoCleanupFailed: "Lesson video cleanup failed",
    },
    // Messages returned by assessments, attempts, and manual essay grading.
    assessment: {
        ...generateMessage("Assessment"),
        draftOnly: "Assessment content can only be edited before publication",
        published: "Assessment published successfully",
        closed: "Assessment closed successfully",
        notOpen: "This assessment is not currently open",
        accessDenied: "The required lesson or package entitlement is missing",
        invalidQuestions: "Select questions from the course teacher's bank",
        invalidLesson: "Select a lesson from the same course",
        cleanupFailed: "Assessment automatic submission failed",
        conflict: "The assessment or attempt changed; retry the request",
    },
    attempt: {
        ...generateMessage("Attempt"),
        started: "Assessment attempt started successfully",
        limitReached: "The allowed number of attempts has been reached",
        answersSaved: "Attempt answers saved successfully",
        submitted: "Attempt submitted successfully",
        alreadySubmitted: "This attempt has already been submitted",
        sequenceConflict: "The answer save sequence changed; reload the latest attempt",
        graded: "Essay grades saved successfully",
        notSubmitted: "Submit the attempt before grading",
        invalidGrade: "Grade only essay questions within their allocated points",
    },
    // Messages returned by the teacher's reusable question bank.
    question: {
        ...generateMessage("Question"),
        updateConflict: "The question changed before the update completed; retry the request",
    },
    // Messages returned by learning progress and single playback sessions.
    learning: {
        sessionStarted: "Playback session started successfully",
        sessionClosed: "Playback session closed successfully",
        sessionNotActive: "This playback session has expired or was replaced; start a new session",
        heartbeatSaved: "Playback heartbeat recorded successfully",
        sequenceConflict: "The heartbeat sequence changed; refresh the playback session",
        heartbeatTooSoon: "Wait at least three seconds before sending another heartbeat",
        videoChanged: "The lesson video has changed; start a new playback session",
        videoUnavailable: "A recorded video with a valid duration is required",
        positionInvalid: "Playback position exceeds the video duration",
        progressFetched: "Lesson progress fetched successfully",
        requirementUpdated: "Lesson watch requirement updated successfully",
        prerequisiteRequired: (percentage) => `Watch at least ${percentage}% of the prerequisite lesson before opening this lesson`,
        prerequisiteInvalid: "Choose another recorded lesson with a valid video in the same course",
        prerequisiteCycle: "Lesson watch requirements cannot form a cycle",
    },
    // Messages returned by the append-only ledger and financial reports.
    ledger: {
        ...generateMessage("Ledger entry"),
        payoutRecorded: "Manual teacher payout recorded successfully",
        paymentMismatch: "The submitted payment amount does not match the saved order amount",
        insufficientBalance: "The payout exceeds the teacher's outstanding amount with this account manager",
        receiverNotFound: "The receiving account manager was not found",
        teacherNotFound: "Teacher account not found",
        idempotencyConflict: "This payout request key has already been used for different details",
        transactionConflict: "The financial balance changed; retry the request",
        reportsFetched: "Financial report fetched successfully",
        balancesFetched: "Outstanding teacher balances fetched successfully",
    },
    // Messages returned by content access and educational grants.
    entitlement: {
        ...generateMessage("Entitlement"),
        granted: "Educational grant created successfully",
        alreadyGranted: "The student already has access to this product",
    },
    // Messages returned by orders, manual payments, and purchase approval.
    order: {
        ...generateMessage("Order"),
        alreadyPurchased: "The student already has access to this product",
        pendingOrderExists: "An order for this product is already awaiting payment or review",
        notPurchasable: "This product is not currently available for purchase",
        studentNotActive: "An active student account is required",
        paymentRequired: "Submit the manual payment before reviewing this order",
        alreadyReviewed: "This order has already been reviewed",
        approved: "Order approved and product access granted successfully",
        rejected: "Order rejected successfully",
        notificationsFetched: "Order notifications fetched successfully",
        notificationRead: "Order notification marked as read",
        notificationNotFound: "Order notification not found",
    },
    payment: {
        ...generateMessage("Payment"),
        alreadySubmitted: "Payment has already been submitted for this order",
        orderNotPayable: "This order is not awaiting payment",
    },
    // Messages returned by product pricing and settings endpoints.
    product: {
        created: "Product created successfully",
        fetchedSuccessfully: "Products fetched successfully",
        updated: "Product updated successfully",
        notFound: "Product not found",
        courseNotFound: "Course not found",
        lessonNotFound: "Published lesson not found in this course",
        teacherApprovalRequired: "Teacher approval is required to manage products",
        duplicateProduct: "This product already exists",
        noRemainingLessons: "There are no remaining lessons in this product",
        commissionFetched: "Platform commission fetched successfully",
        commissionUpdated: "Platform commission updated successfully",
        teacherCommissionFetched: "Teacher commission fetched successfully",
        teacherCommissionUpdated: "Teacher commission updated successfully",
    },
};

